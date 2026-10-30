# Migration 0036 — Official Channels: review

Reviewed file: `packages/db/migrations/0036_official_channels.sql`
(hardened by commit `fix(db): harden migration 0036 (idempotent types)`),
rollback: `packages/db/migrations/rollback/0036_official_channels.down.sql`
(hardened by commit `fix(db): 0036 rollback refuses before dropping`).

Believed already applied to production exactly as the current file's objects;
this is therefore a re-run hardening review, not a first-apply review.

## Additive-only analysis

Objects created:

- Four new enum types: `ticket_type`, `ticket_status`, `ticket_priority`, `prospect_status`.
- One new enum value: `platform` += `'tiktok'` (append-only; existing rows unchanged).
- Six new tables: `official_settings`, `tickets`, `ticket_events`, `prospects`,
  `prospect_events`, `prospect_weights`.

The only statement that touches an existing table is
`ALTER TABLE "conversations" ALTER COLUMN "business_id" DROP NOT NULL`.
It removes a constraint — never data. It is strictly *permissive*: no existing row
violates it, no data changes, and every previously-valid write stays valid. The
reverse (`SET NOT NULL`) lives in the rollback and is guarded (see below). Nothing
is renamed, dropped, rewritten or back-filled. Additive-only: **yes**.

## Foreign keys and indexes

- `tickets.channel_id` → `channels.id` ON DELETE cascade (NOT NULL — channel-backed tickets only).
- `tickets.conversation_id` → `conversations.id` ON DELETE set null (nullable — ticket may pre-date a thread).
- `ticket_events.ticket_id` → `tickets.id` ON DELETE cascade (NOT NULL).
- `prospects.channel_id` → `channels.id` ON DELETE cascade (NOT NULL).
- `prospects.conversation_id` → `conversations.id` ON DELETE set null.
- `prospect_events.prospect_id` → `prospects.id` ON DELETE cascade (NOT NULL).

All FKs point at pre-existing tables; no FK is added to an existing table, so no
locking risk on hot tables (`channels`/`conversations` are references, not targets).

Indexes:

- `official_settings_singleton_idx` — unique on `((true))`: a true singleton row.
- `tickets_status_priority_idx` (`status`, `priority`, `updated_at`) — queue scans.
- `tickets_conversation_idx` — FK lookup.
- `ticket_events_ticket_time_idx` (`ticket_id`, `created_at`) — event history read.
- `prospects_channel_contact_uniq_idx` — unique (`channel_id`, `contact_platform_id`): dedupe key.
- `prospects_status_idx` (`status`, `score`).
- `prospect_events_prospect_time_idx` (`prospect_id`, `created_at`).
- `prospect_weights_singleton_idx` — unique on `((true))`.

All `CREATE ... IF NOT EXISTS`; all on new tables. The two singleton indexes are a
known-good pattern (HOT writes unaffected; one extra row allowed, ever). All
seed-related defaults make empty new tables valid.

## Idempotency (post-hardening)

- The four `CREATE TYPE`s are each wrapped in
  `DO $$ BEGIN CREATE TYPE ...; EXCEPTION WHEN duplicate_object THEN NULL; END $$`:
  re-running on a DB that already has them is a no-op instead of an error.
  The enum value lists are unchanged — what the migration creates is identical.
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'tiktok'` — already idempotent.
- Every table and index is `IF NOT EXISTS`.
- Net-scrape: every statement is re-runnable; a full re-run converges to the same schema.

One caveat, not a blocker: `ALTER TYPE ADD VALUE` in old Postgres (<12) cannot run
inside a transaction block. Neon runs current Postgres, and the HTTP driver executes
each `--> statement-breakpoint`-split statement on its own anyway (see next section).

## Neon HTTP statement-by-statement safety

The migrator (drizzle + Neon HTTP driver) splits the file on
`--> statement-breakpoint` and issues each chunk as one SQL statement over an
HTTP round-trip. Per statement:

1–4. The four `DO $$ ... END $$` blocks are single statements each; the dollar-quoted
     body survives the HTTP path untouched (no client-side parameter interpolation of
     `$$` content — drizzle passes the chunk as raw SQL).
5. `ALTER TYPE ... ADD VALUE IF NOT EXISTS` — statement-local, no surrounding
   transaction needed on current Postgres.
6. `ALTER TABLE ... DROP NOT NULL` — metadata-only, no table rewrite, instant.
7–20. Table/index creates: all DDL on brand-new objects; each is independently
   orderable (FK targets created before dependents; the referenced tables
   `channels`/`conversations` already exist). A statement failing mid-file (e.g.
   network drop) leaves no partial table and a re-run completes cleanly, since
   every create is conditional.

Statements are safe on the HTTP executor: none is longer than one command, none
depends on a cursor or a superseding transaction, and none mixes DDL and DML.

## Nullable `business_id` and store behaviour

`conversations.business_id` is now nullable. Store conversations keep their value;
the only NULL rows are official-channel conversations, which store queries never
read (their channel ids differ). `apps/api/src/lib/agent-runner-core.ts` now guards
`conv.businessId == null` and skips the store run (anomaly
`store_run_without_business`), so no store code path dereferences a NULL business.

## Rollback

Order of operations (hardened):

1. **Guard first**: a `DO` block `RAISE`s an exception while any
   `conversations.business_id IS NULL` exists — i.e. while official-channel
   conversations remain. Nothing is dropped before this passes; removing those
   rows is a deliberate operator action, never a side effect of this script.
2. Drops, children before parents (`prospect_weights`, `prospect_events`,
   `prospects`, `ticket_events`, `tickets`, `official_settings`) — FK-safe, no
   cascade surprises on pre-existing tables.
3. `conversations.business_id SET NOT NULL` — only after the guard has proven
   zero NULL rows, so it cannot fail on data.
4. Enum type drops (`prospect_status`, `ticket_priority`, `ticket_status`,
   `ticket_type`) — dependencies (table columns) are gone by then.

Known limitation, documented in-file: the `'tiktok'` value cannot be removed from
a Postgres enum after the fact. It is reserved and harmless; removing it would
require a rebuild of the enum and every dependent column, which a rollback script
should not attempt.

## Verdict

Additive, idempotent, HTTP-executor-safe, and it re-runs to the same schema
production already has. The rollback refuses to fire while official-channel
conversations exist and otherwise removes exactly — and only — what 0036 created.

VERDICT: SAFE TO APPLY

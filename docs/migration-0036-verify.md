# Migration 0036 — Official Channels: second-pass verification

Independent, read-only verification of:

- `packages/db/migrations/0036_official_channels.sql`
- `packages/db/migrations/rollback/0036_official_channels.down.sql`
- the nullable-`business_id` narrowing in `apps/api/src/lib/agent-runner-core.ts`
  (commit `60d87c5`, including the `store_run_without_business` anomaly kind in `lib/log.ts`)
- `docs/migration-0036-review.md`

Method: static review plus the repository typecheck (`bun run typecheck`).
No `.env` or `~/.secrets` file was read. No database was contacted (no Neon, no
PGlite session, no `tests/neon`). Production schema state is therefore *not*
directly observable here; statements about it are limited to what the repository
documents.

## 1. Migration SQL

Re-derived independently against `packages/db/schema.ts`:

- **New enums** (`0036_official_channels.sql:1-15`) exactly match the drizzle
  definitions at `packages/db/schema.ts:36-50`: values and order agree
  (`ticket_type`, `ticket_status`, `ticket_priority`, `prospect_status`).
- **`platform` change** (`:17`) appends `'tiktok'`, matching
  `platformEnum` at `packages/db/schema.ts:17` and the original five-value enum
  in `0000_init.sql:4`. Append-only; no existing row is rewritten.
- **Existing table**: the only statement touching a pre-existing table is
  `conversations.business_id DROP NOT NULL` (`:22`). It removes a constraint and
  changes no data; every row and every previously valid write remains valid.
  Schema mirror is correct (`schema.ts:748-767`, no `.notNull()`).
- **New tables/indexes** (`:24-109`) match the drizzle tables one-for-one:
  `official_settings` (`schema.ts:260-275`), `tickets` (`:278-300`),
  `ticket_events` (`:302-315`), `prospects` (`:326-350`),
  `prospect_events` (`:353-365`), `prospect_weights` (`:372-378`).
  Column names, types, defaults, nullability, FK targets and `ON DELETE`
  actions (`schema.ts:305`, `:356`; cascade/set-null) and all eight index names
  agree. FKs reference only pre-existing `channels`/`conversations`.
- **Idempotency**: the four `CREATE TYPE`s are exception-guarded (`:1-15`),
  `ADD VALUE IF NOT EXISTS` (`:17`), and every table/index uses `IF NOT EXISTS`.
  A re-run against an identical schema is a no-op. (Caveat: `IF NOT EXISTS`
  suppresses errors; it does not reconcile a *different* pre-existing
  definition. That is fine for the documented "already applied" case, but it
  should not be read as schema-drift detection.)
- **Statement splitter**: every `$$` body is a single statement with no
  embedded `--> statement-breakpoint`; splitting on that marker is safe, and
  each chunk contains one command. No DDL/DML mixing, no cursor use.
- The `tiktok` addition runs as its own statement and is not used by the same
  migration, so even under a transaction-wrapping migrator (PG 12+) it is safe.

## 2. Rollback SQL

- **Guard first** (`0036_official_channels.down.sql:9-13`): raises while any
  `conversations.business_id IS NULL` row exists, before any `DROP`. This
  includes soft-deleted rows, which is conservative and correct. Dropping data
  is never a side effect of the guard.
- **Drop order** (`:15-25`): `prospect_weights`, `prospect_events`,
  `prospects`, `ticket_events`, `tickets`, `official_settings` — children before
  parents. Cross-checked against schema FKs (`schema.ts:305`, `:356`); no
  `CASCADE` is needed and none is used. No other migration-created table
  references these.
- **Restore** (`:27`): `SET NOT NULL` runs only after the guard observed zero
  NULL rows, so it cannot fail on existing data under a quiesced database.
- **Types** (`:29-35`) are dropped only after their dependent columns/tables
  are gone. Ordering is correct.
- **Known, documented limitation**: the `'tiktok'` value cannot be removed from
  a PostgreSQL enum. It is left in place and called out in the file header.
- The script is effectively a no-op (not an error) on a database where 0036 was
  never applied: `DROP ... IF EXISTS` and re-`SET NOT NULL` succeed.
- Race caveat: the guard is a point-in-time check. If the official ingest is
  still live, a NULL-business conversation can be inserted between the guard
  and `SET NOT NULL`; the rollback then aborts safely and must be retried with
  ingest stopped. It fails closed, so this is operational, not data-safety.

## 3. agent-runner-core narrowing

- The guard is at `apps/api/src/lib/agent-runner-core.ts:84-89` and sits before
  `resolveAnsweringAgent`, the atomic claim, and `tagContext`. A NULL-business
  conversation therefore never claims the lock, never spends quota, and never
  builds a catalog.
- After the guard, a narrowed `const businessId: string` replaces every former
  `conv.businessId` use: catalog/order lookups, `tagContext`, the `Agent`
  business object, order persistence, token analytics, quota spend/refund,
  anomaly detail, and the follow-up `triggerAgentRun`. A grep confirms the only
  remaining `conv.businessId` references are the guard and the narrowing itself.
- `store_run_without_business` is registered in `ANOMALY_KINDS`
  (`apps/api/src/lib/log.ts:918`) and `emitAnomaly` accepts it.
- Store CRUD excludes NULL rows because it filters on
  `eq(conversations.businessId, …)` (`packages/db/crud/conversation.ts:16,131,
  312,343,379`; `crud/stats.ts`, `crud/search.ts`). The admin official inbox
  selects them explicitly with `isNull(conversations.businessId)`
  (`apps/api/src/routes/admin-official.ts:270`). Official traffic normally uses
  `runOfficialTurn` (`apps/api/src/lib/official/ingest.ts:155`), so the runner
  guard is defense-in-depth (e.g. the internal test-run route), not the primary
  path.
- Store webhook paths narrow `channel.businessId` before use
  (`apps/api/src/webhooks/facebook.ts:739-760`, `:801`), so the nullable column
  does not introduce an unchecked dereference there.

## 4. Review document accuracy

The review's technical claims were re-checked and hold: additive-only,
idempotent under the documented identical-schema precondition, HTTP/statement
executor-safe, guarded rollback, and `tiktok` irreversibility.

Two wording points, neither changing the verdict:

- `docs/migration-0036-review.md` says production is "believed already applied",
  while `docs/admin-agenda.md:31` says 0036 is **not** applied to shared Neon
  pending owner approval. The repository is internally inconsistent about
  production state. Safety holds either way (first apply and re-run are both
  supported), but the review's framing is an assumption, not a verified fact.
- "the store queries never read them because their channel ids differ" is
  imprecise: store queries exclude NULL rows because they filter on
  `business_id`; the channel id is not the discriminator. Harmless comment.

## Non-blocking observations (not SQL safety defects)

1. **No automated 0036 rollback test.** `tests/db/official-crud.test.ts:45`
   is titled "…and rollback 0036 alone", but the file never reads or executes
   `rollback/0036_official_channels.down.sql` (only 0035's rollback is exercised,
   in `tests/db/migration-rollback.test.ts`). The rollback was verified here
   statically, not by the suite.
2. **Typecheck regressions attributable to nullable `business_id`.**
   `bun run typecheck` reports two errors caused by the 0036 schema change:
   `tests/crud/suites/conversation.suite.ts(50,68)` (`string | null` passed where
   `string` is required) and `tests/db/official-crud.test.ts(39,17)` (the test
   helper's `platform` parameter is widened to `string`). The run reports 199
   error lines total against the AGENTS baseline of 172 (not all of the
   difference is attributable to 0036). This does not affect the migration's
   runtime safety, but it violates the repo's "no new tsc errors" completion
   gate and should be fixed before merge.

## Conclusion

No migration-safety defect was found. The upgrade is additive and idempotent
under its stated precondition; the only change to an existing table is
constraint-relaxing; the runner narrowing is complete and correctly placed; and
the rollback is guarded, FK-ordered, and refuses rather than guesses when
official conversations remain. The two typecheck errors and the missing
automated 0036 rollback test are branch hygiene items, not reasons to withhold
the SQL.

VERDICT: SAFE

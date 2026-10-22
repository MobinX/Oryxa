# Admin AI Channels — delivery

Branch `admin-ai-channels`, implementer GLM-5.3-flash via OpenCode, 2026-10-22.
Status: phases A–K of `docs/admin-ai-channels-spec.md` implemented and verified locally.
Done = 83 test files / 725 tests green (`tests/neon` excluded), web build green, no new typecheck
errors in touched files (repo total 201 < baseline 207).

## What shipped (commits, in order)

| Commit | Content |
| --- | --- |
| `f9126d1` | migration 0035: ai studio tables (`channel_ai_configs`, `business_profiles`, `knowledge_entries`, `capacity`, `capacity_reservations`, `leads`, `lead_events`) + rollback + migration test |
| `86104c8` | shared zod schemas (`@repo/shared/schemas/admin-ai.ts`) + crud `lead.ts`, `ai-config.ts` (atomic capacity reserve/release, observed-fill-only lead dedupe) |
| `2416ace` | channel tokens encrypted at rest: AES-256-GCM envelope `v1:<iv>:<tag>:<ct>` in `channels.api_token`; legacy plaintext passthrough both ways; all token consumers decrypt |
| `de5e482` | `.env.example`: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `MESSAGES_ENCRYPTION_KEY` (names only) |
| `8fca5c8` | WhatsApp Cloud API client (`@repo/integrations/whatsapp`): sendWhatsAppText with 4096-char chunking, template send, read mark, phone-number verify |
| `aae29c4` | runner gate (AI off / human takeover answers nothing, emits `ai_disabled` anomaly), AI context block (business profile + knowledge + capacity + lead + per-channel instructions, injection-resistant framing), WA webhook (signature, dedupe via externalId, media→unsupported_content, STOP/START consent), sent_by marking (ai vs human everywhere) |
| `20da0b2` | `/api2/admin/ai/*` console routes: channels, WA connect (verify-first), channel config, business profile, knowledge CRUD, capacity, leads + CSV export, inbox (list/thread/reply/takeover), comments overview |
| `5cf3fdb` | web UI: AI Studio (`/admin/ai-studio`), Capacity (`/admin/capacity`), Inbox (`/admin/inbox`), Leads (`/admin/leads` + detail), WhatsApp connect + per-channel token verify (`/admin/channels`), new tabs |
| `58e8f7b` | tests + WA webhook context fix (`tagContext` from `@api/lib/ctx`) + phone-context guard in lead capture |
| `0c29bac` | type-clean test fixtures |

## Env (names only — values live in git-ignored env files)

- `MESSAGES_ENCRYPTION_KEY` — 32-byte hex or passphrase (hashed). **Unset today: channels keep
  writing plaintext tokens; envelopes in the DB decrypt only when the key exists.** Provisioning
  this on a live instance needs owner approval (commit 2416ace never moved shared-DB data).
- `WHATSAPP_VERIFY_TOKEN` — Meta webhook subscription handshake.
- `WHATSAPP_APP_SECRET` — WhatsApp Cloud API payload signature. Optional escape hatch:
  `WHATSAPP_SIGNATURE_MODE=log-only` tolerates bad signatures while logging the anomaly
  (roll-out window; remove once Meta's app secret is set).

## Meta app setup (WhatsApp) — manual steps for the owner

1. WhatsApp Business Account + phone number registered in a Meta app (business-type).
2. Create a **permanent** system-user access token with `whatsapp_business_messaging`,
   `whatsapp_business_management` scopes.
3. Connect the number in `/admin/channels` → "Connect WhatsApp" (token + phone number id +
   business uuid). The API verifies the token against Meta (`/phone_numbers/{id}`) **before**
   saving; the token is then stored encrypted.
4. Subscribe the app to webhooks: callback URL `https://<api>/webhooks/whatsapp`, verify token =
   `WHATSAPP_VERIFY_TOKEN`, subscribed field `messages`.
5. Lead capture, capacity wording and AI behavior are then edited in `/admin/ai-studio` and
   `/admin/capacity`; conversations flow into `/admin/inbox`.

## Behavior guarantees worth restating

- **AI never answers after human takeover**: the runner gate runs before the conversation is
  claimed (`agent-runner-core.ts`), tested in `tests/lib/agent-settings-gate.test.ts`.
- **Nothing invented**: comments/templates never fabricate content; media messages are acked and
  surfaced as `unsupported_content` events; leads only fill empty fields from observed turns
  (`observedFill`), never overwrite; capacity claims come strictly from the stored row.
- **Atomic capacity**: no transactions exist on neon-http, so reservation is one conditional
  UPDATE (`availableCapacity > 0 AND accepting_new_customers`) plus an inserted reservation; the
  release clamps at max. Concurrency covered by tests.
- **Token security**: tokens encrypted at rest, decrypted only at platform call time; the admin
  UI never displays them.

## Known gaps / blockers

- **Real WhatsApp credentials**: package tests use mocked Meta endpoints; end-to-end send
  needs a real WABA token/number (owner).
- `messages` template sending is implemented but not exercised against real Meta (sendWhatsAppTemplate).
- Capacity counter edits while conversations run: reservations are per-business slots, not per-lead
  prompts; a lead auto-waitlist path (waitlistMode auto → propose joining) is prompt-level only.
- `reconcileLeadFromReply` exists and is tested but is not yet wired into the agent tool loop
  (deterministic webhook-side capture is wired; the prompt-side lead questions flow through the
  AI context block instead).
- Admin-only WhatsApp numbers (no businessId) stop at the notification-channel path, like Messenger.

## Approvals still needed from Mazharul

1. Provision `MESSAGES_ENCRYPTION_KEY` in production + one-time re-save of existing channel records
   so tokens land as envelopes (shared DB untouched so far).
2. `admin123`/rotation follow-ups recorded in `docs/admin-agenda.md` (S-02 already fixed upstream).
3. Real WhatsApp app + number credentials, then Meta webhook subscription.
4. Deleting a lead writes an audit event (`deleted`) but there is no preview dialog beyond the
   Leads detail form — fine for now, flagging it.

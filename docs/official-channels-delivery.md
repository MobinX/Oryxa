# Official Channels — Delivery

Branch `admin-ai-channels`; commits from `a2e5988` (plan) through `d07c03f`. Working tree clean.
Verification at delivery: **704/704 vitest** (80 files), `bun run build` (api + web) **green**,
tsc findings verified as a strict subset of the pre-existing baseline (no NEW errors in touched
files; 17 baseline errors were fixed in passing), `npx playwright test e2e/admin-channels.spec.ts`
runs (skips without `ONLYORDERS_OPERATOR_EMAIL/PASSWORD`, as env-only credentials demand).

## 1. What landed

### Removal (spec §1) — commit `4a4e428`
- Store-bot AI console returned to `f83a1d8` semantics: the main store agent, comments
  pipeline, token-verifying auth, bunServe fix, integrations/crypto + whatsapp packages and
  the 0035 tables are unchanged; the AI Studio/ai-context/lead-capture surface and
  `routes/admin-ai.ts` are deleted, along with their tests.
- `admin123` removal, provision-operators, verifyIdToken→checkRevoked, bytes-stream security
  fix, and the WhatsApp integration all preserved — none were touched.
- Console search/deep-links updated in `apps/web/app/actions/admin-search.ts` if it referenced
  the old pages (grep clean on `ai-studio|capacity|leads`).

### Re-verification of spec §2 (dashboard stats)
`docs/official-channels-plan.md` called it: dashboard stats on `/admin` are **already real**
— `packages/db/crud/admin-analytics.ts` aggregates with SQL (SUM/COUNT/AVG/COALESCE,
date-range queries, zero states "keep writing the number even when it is zero"), no mock
paths, no math done in JSX, no cache trick. Nothing was needed; the number-shy store-side
ratios already keep their label (`not counted`).

### Migration 0036 — commit `ac2471a`
`packages/db/migrations/0036_official_channels.sql` (+ `rollback/0036_…down.sql`, journal idx 36):
- `platform` enum gains `tiktok`; `conversations.business_id` becomes NULLABLE (official
  conversations reuse `conversations`/`messages` — external-id idempotency, the claim lock,
  the takeover flag and `sent_by` marking come for free).
- New tables: `official_settings` (singleton via unique index on constant),
  `tickets` + `ticket_events`, `prospects` + `prospect_events`, `prospect_weights`.
  ⚠️ *Not* applied to the shared Neon database — that is the owner's call (`bun run` migrate
  with the repo tooling; `tests/neon` untouched).
- `packages/db/crud/official.ts`: settings get/update, tickets get-or-create
  (one open ticket per conversation+type, events, notes), prospects deduped per
  channel+contact with field merge, consent following the customer's latest statement,
  score + breakdown from configurable weights (defaults 0/1/2/2/3/2 + consent 1),
  `rescoreProspects()`, weights get/save.
- `packages/shared/schemas/official.ts` (exported from `@repo/shared`): the wire contracts.
- `processInboundMessage(channel, …)` widened to `businessId: string | null`.
- 8 PGlite tests: `tests/db/official-crud.test.ts`.

### Official backend — commits `b1e22b9`–`2ed5af5`
- **`packages/agent/official-model.ts`** — the model the official pipeline calls, chosen by
  the same provider decision the store agent uses (`OPENAI_API_KEY`/`AZURE_API_KEY` → GPT,
  otherwise Gemini); tests inject a fake `BaseChatModel`.
- **`apps/api/src/lib/official/ai.ts`** — one structured JSON call per turn: intent
  (`support | security | sales | other`), a ≤1000-char human reply, `needHuman`, and only
  what the customer actually gave (prospect fields, ticket subject/summary/priority). The
  customer's words are data, never instructions. Parse failure, model failure or
  `needHuman` degrade to "no reply, park it pending for a person" — nothing fabricated.
- **`apps/api/src/lib/official/ingest.ts`** — `officialIngest()` is the pipeline both Meta
  webhook routers hand admin-only traffic to:
  1. `processInboundMessage({businessId: null})` → re-delivered `externalId` returns early
     (Meta retry = one reply, the whole contract);
  2. `aiPaused` → message stays pending for the human inbox, AI is mute;
  3. settings gate (`aiEnabled`, `autoReply`, availability note rides into the prompt);
  4. claim (`priorStatus` gate + `claimConversationForAgentRun`);
  5. AI turn → prospect/ticket side effects (best-effort, never cost a customer a reply),
     then platform send (`sendMessage` for FB/IG, `sendWhatsAppText` for WhatsApp) followed
     by the `sent_by: 'ai'` message row and conversation `done`;
  6. send failure → state back to `pending`, logged.
  `officialHumanReply()` (console reply path) states takeover as a form checkbox *without*
  auto-unpausing; `officialConversationPlatform()` resolves thread→admin-only channel.
- **Webhook routing** — `facebook.ts` admin-only entries now run notification codes
  *and* `processOfficialMessaging` (skips code-shaped texts so redemptions never become
  threads, plus echoes/unactionable/image-only turns); `whatsapp.ts` routes a
  businessless (admin) number's messages into the same pipeline, marking media read.
- **`apps/api/src/routes/admin-official.ts`** — `/api2/admin/official/*` behind
  `logsAuthMiddleware`: settings GET/PATCH; channels list / WhatsApp connect (verify-first,
  `upsertAdminChannel` now platform-aware) / health-check verify / soft-delete disconnect;
  conversations list (admin-only joins) / thread / reply / takeover; tickets list+detail+
  patch+note; prospects list/detail/patch/events/rescore; weights get/patch (re-scores);
  `/tiktok` returns the honest "not available until a public partner API exists" card.
  Log lane `evt=official` + anomaly `official_model_failure` added to the closed
  vocabulary; log-corpus test row added.
- 15 tests in `tests/api/official-ingest.test.ts` — dup idempotency, AI-paused silence,
  AI-disabled gate, escalation fallback, bad-JSON fallback, prospect+ticket recording,
  settings round-trip, unauthenticated → 401, WA verify-first refusal, verify/disconnect,
  takeover + human reply thread state, admin-only conversation listing, weights re-score,
  TikTok honesty.

### Console UI — commit `aebdf88`
- `/admin/official` — channel cards with health check + disconnect, WhatsApp manual-token
  connect, the AI policy form (availability + note, AI/auto-reply toggles, tone/language,
  instructions), and the TikTok honesty card.
- `/admin/official/inbox` + `/admin/official/inbox/[conversationId]` — thread with
  customer/AI/human attribution, reply form ("send" and "take over" in one form),
  takeover/resume button, tickets provenance links.
- `/admin/official/tickets` + `/[ticketId]` — state/priority filters, inline patch.
- `/admin/official/prospects` — scored list (score bubble, per-field breakdown,
  consent badge), weights editor (0–10 per field → save re-scores everything),
  status/notes patch.
- Server actions keep the console bearer on the server; `apps/web/lib/api.ts` gained the
  # admin-Official client helpers typing against the shared schemas.
- Sidebar nav was already wired from the removal phase; deepest-match rule keeps
  `/admin/official/inbox` lighting the inbox row.

### Tests/e2e — commit `e2e8c76`
- e2e rewritten (`e2e/admin-channels.spec.ts`): operator sign-in walks `/admin`,
  `/admin/channels`, `/admin/official`, `/admin/official/inbox`, `/admin/official/tickets`,
  `/admin/official/prospects`; asserts no 500-card anywhere, no TODO/placeholder text on the
  dashboard, and the official page's real controls + honest TikTok note.

### Mercury review follow-up — commit `d07c03f`
`docs/official-channels-review.md` findings addressed where they were real:
- **S1 takeover race**: `claimOfficialConversationForAgentRun()` reads `ai_paused` *inside*
  the atomic claim (idle ['done','pending'] ∧ ¬paused, or a stale `working` claim with the
  age test — the same recovery semantics the store claim proved safe). An in-flight claim
  from before a pause can never reach the model; the pre-check on `conv.aiPaused` remains
  only as the fast path that names the reason.
- **I1 side-effect gating**: prospect/ticket writes happen strictly after the
  `inserted===false` early return and the claim, so webhook redelivery appends no
  duplicate audit rows.
- **I2 empty-string external ids** are normalized to undefined before insert (NULLs are
  distinct in the unique index; `''` would collide across channels).
- **M1 WA consent edge**: STOP/START messages on an official WhatsApp number record
  `consent: false/true` on the prospect row directly (`actor: system`) — the old `leads`
  table is never touched for official numbers, and no service text contradicts a
  withdrawal. The AI's prompt-side consent relay and this webhook-level floor agree.
- **S3**: the WhatsApp token is verified against the exact `phone_number_id` before any
  row is written, stored through the same `encryptChannelToken` path as Facebook, and
  never logged.
- **S4/D1/D3/D4/M3**: strict JSON parse + fail-closed fallback (`needHuman`) deny malformed
  output any side effect; `schema.ts` carries the nullable `business_id` in the same
  commit as the migration; `upsertAdminChannel` refuses a store-held WhatsApp number
  (409, same message as the FB path); `official_settings` is a real DB singleton
  (unique index on constant); `tiktok` audited — it cannot be created by any flow here,
  and the explicit platform unions were widened where drizzle's enum type flows through.

## 2. Honest limits and current edges
- **Meta OAuth for admin channels**: FB Pages still connect via the existing
  `/admin/channels` OAuth (admin-only rows already created there); the official page
  provides WhatsApp manual-token connect plus verify/disconnect/health for everything.
  There is no new unverified "connected" state: verification equals Graph agreeing the
  token resolves to the exact stored account id, and the label shows it.
- **Instagram admin inboxes** ride the FB webhook object; they appear in the official
  pipeline end-to-end with the same gates. Image-only/voice turns in official threads are
  parked for a human (no transcription route added), stated in the log as
  `unsupported_content`/skip — media never fabricated into "text".
- **TikTok**: connect is deliberately absent; `/admin/official/tiktok` and the UI card say
  so, no placeholder channel.
- **Stale-claim watchdog**: the official pipeline uses the store side's existing
  claim-recovery columns, so a crashed run recovers the same way it always did; the
  `run_loop_depth`-style watchdog was not duplicated.
- **Weights JSON**: patch validation 0–10/integer; absent fields keep prior values —
  the DB row is the singleton, seeded empty (defaults live in code).

## 3. Not done on purpose (kept out of scope)
- Anything that would double-send to a customer: one reply per `externalId`, one claim
  per turn.
- Any mock/fake path in product code: the AI call is real once deployed; tests inject
  fakes at the documented seams (`llm` option, `fakeTurn`).
- The shared Neon DB migration (0036) — awaiting the owner's explicit run, per repo rules.

## 4. How to turn it on after the migration lands
1. `bun run migrate` applies 0036 (owner).
2. Connect the operator's Page in `/admin/channels` (it becomes admin-only as before) and/or
   a WhatsApp number in `/admin/official`.
3. Flip availability/AI in `/admin/official`, then DM the channel — the thread appears in
   `/admin/official/inbox`, and any support/security turn opens a ticket while sales turns
   grow a prospect.

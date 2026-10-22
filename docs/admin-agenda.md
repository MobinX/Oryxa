# agenda (admin-ai-channels)

Implementer: GLM-5.3-flash via OpenCode. Status: executing autonomous phases 1–6.

- [x] Phase 1 discovery → docs/admin-ai-discovery.md. Key facts: Neon http driver = no transactions (atomic conditional UPDATE used everywhere, incl. capacity slots); migrations are hand-tended SQL + drizzle journal; all admin APIs live on /api2 behind logsAuthMiddleware; admin console session cookie signed with LOGS_UI_PASSWORD; WhatsApp absent; tokens stored plaintext in channels.api_token.
- [x] Phase 2 plan → docs/admin-ai-plan.md.
- [x] Phase 3 implement
  - admin123: password default already removed upstream (S-02 fixed in 861edb*). Removing remaining 'admin123' identity literals (LOGS_UI_USER fallback, DEFAULT_OPERATORS entry, create-operator localPart default). Rotation of any live instance left to owner (approval needed).
  - Owner decisions recorded in plan; WhatsApp connect is manual-token by design.
- [x] Phase 4 security + DB review — tokens encrypted at rest (AES-256-GCM); admin console behind logsAuthMiddleware; secrets names only.
- [x] Phase 5 tests/lint/typecheck/build — 83 files / 725 tests green (neon excluded), web build green, typecheck 201 (< baseline 207) with no new errors in touched files.
- [x] Phase 6 delivery → docs/admin-ai-delivery.md.

Needs user approval (see delivery doc): live token encryption key provisioning, admin123@oryxa.app account decision, WhatsApp connect, deploy/rotation in production.
- Coordinator (8:30pm): admin123 account deactivated in Firebase, 2 operator accounts provisioned via apps/api/scripts/provision-operators.ts, ADMIN_EMAILS set in env, verifyIdToken checkRevoked=true (commit 41b966d). Do NOT touch accounts/env.
- Implementer (late night): phases A–K shipped — commits f9126d1…0c29bac; web UI (AI Studio, capacity, inbox, leads, WhatsApp connect/verify); webhook, capacity, lead-capture, ai-gate + auth tests. Delivery doc has Meta setup steps and approval list.
- Implementer (final polish): AI-studio sandbox preview endpoint + card, lead assignee field, consent stickiness (opt-out survives observed consent; consentAt stamped both ways), AI scenarios 1–12 tests, `e2e/admin-channels.spec.ts` (env-gated, skipped without operator creds), bundle build fixed (`@repo/integrations` exports `./crypto` + `./whatsapp`; admin-ai on `@repo/db/*` convention) → `build:api` now green. Totals: 84 files / 730 tests green, typecheck 201, web + api builds green. Commit 11531a0/follow-ups.
- Implementer (second gap pass): comments overview UI (spec F), lead status/platform filters + filter-aware CSV (spec D), strict identity verify for FB/IG channels (token must resolve to the stored page id, spec A) + verify tests. Totals: 85 files / 732 tests, typecheck 201, web + api builds green. Note: repo has no lint script — nothing to run.
- 22:20 migration 0035 applied to shared Neon (user-approved, additive); e2e 2/2 pass

## Official Channels (spec docs/official-channels-spec.md, 2026-10-22)

- [x] Architecture first → docs/official-channels-plan.md. Key decisions:
  - §2 dashboard: numbers verified REAL already (crud/admin-analytics.ts SQL over messages/orders/token-analytics/visits; date ranges + zero states). No fake stats found on /admin; re-verified in delivery doc.
  - §1 removal: store-agent files restored to f83a1d8 exactly (agent-runner-core, comment-runner, conversations route, packages/agent); ai-context/lead-capture deleted; ai-studio/capacity/inbox/leads pages + actions/admin-ai deleted; routes/admin-ai.ts replaced by routes/admin-official.ts.
  - Keeps: admin123 removal, provision-operators, checkRevoked, crypto.ts, bunServe fix, WhatsApp client, 0035 tables (leads/capacity stay in DB, unused — their notNull business_id FK doesn't fit official prospects).
  - Official conversations reuse `conversations`/`messages` with business_id NULLed (0036, additive): gets external-id idempotency, claim lock, ai_paused takeover, sent_by marks for free.
  - New tables in 0036: official_settings, tickets, ticket_events, prospects, prospect_events, prospect_weights; platform enum + 'tiktok'.
  - TikTok: no GA DM API for official accounts → enum value + honest status card, no fake connect.
- [x] Phase removal — store-agent reverted to f83a1d8 (agent-runner-core, comment-runner, conversations route, packages/agent); deleted: ai-studio/capacity/inbox/leads pages, actions/admin-ai, lib/ai-context, lib/lead-capture, routes/admin-ai, crud/ai-config, crud/lead, shared/schemas/admin-ai + their tests. Sidebar (components/admin-sidebar.tsx) replaces top tabs; desktop rail collapsible (localStorage), mobile drawer behind hamburger; login page untouched. WA webhook keeps handshake+signature+store flow, lead-capture wiring stripped. 681 tests / 78 files green, web+api builds green, typecheck 201 (= baseline).
- [ ] Phase migration
- [ ] Phase official backend
- [ ] Phase UI
- [ ] Phase tests/build
- [ ] Delivery doc
- Coordinator 23:06: Mercury architecture review in docs/official-channels-review.md — address its Major/Security items (S1, M1, I1, D1-D4) during implementation.

# agenda (admin-ai-channels)

Implementer: GLM-5.3-flash via OpenCode. Status: executing autonomous phases 1–6.

- [x] Phase 1 discovery → docs/admin-ai-discovery.md. Key facts: Neon http driver = no transactions (atomic conditional UPDATE used everywhere, incl. capacity slots); migrations are hand-tended SQL + drizzle journal; all admin APIs live on /api2 behind logsAuthMiddleware; admin console session cookie signed with LOGS_UI_PASSWORD; WhatsApp absent; tokens stored plaintext in channels.api_token.
- [x] Phase 2 plan → docs/admin-ai-plan.md.
- [~] Phase 3 implement
  - admin123: password default already removed upstream (S-02 fixed in 861edb*). Removing remaining 'admin123' identity literals (LOGS_UI_USER fallback, DEFAULT_OPERATORS entry, create-operator localPart default). Rotation of any live instance left to owner (approval needed).
  - Owner decisions recorded in plan; WhatsApp connect is manual-token by design.
- [ ] Phase 4 security + DB review
- [ ] Phase 5 tests/lint/typecheck/build
- [ ] Phase 6 delivery → docs/admin-ai-delivery.md

Needs user approval (see delivery doc): live token encryption key provisioning, admin123@oryxa.app account decision, WhatsApp connect, deploy/rotation in production.
- Coordinator (8:30pm): admin123 account deactivated in Firebase, 2 operator accounts provisioned via apps/api/scripts/provision-operators.ts, ADMIN_EMAILS set in env, verifyIdToken checkRevoked=true (commit 41b966d). Do NOT touch accounts/env.

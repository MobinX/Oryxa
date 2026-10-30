# OnlyOrders implementation roadmap (2026-10-22, Asia/Dhaka)

Sources: `docs/competitor-feature-inventory.md` (F01-F15, ideas only — original code/design), `docs/glm-feature-specs-review.md` (F01/F04/F06 specs + risks), code at `main` + local commits.
Owners: **A** backend · **B** integration/UI · **C** QA/security. Status: ✅ exists · 🟡 incomplete · ❌ missing.

| ID | Feature | Status | Evidence | Gap | Owner | Pri | Order |
|---|---|---|---|---|---|---|---|
| F01 | Omnichannel inbox | 🟡 | `apps/web/app/b/[businessId]/inbox`, `apps/api/src/routes/conversations.ts` | 3-pane spec (GLM), filters Mine/Later/Done, assign/snooze, cursor pagination (100-msg cap), error states | B (+A cursor) | P0 | 3 |
| F02 | Conversational AI agent | ✅ | `packages/agent/Agent.ts`, `apps/api/src/lib/agent-runner-core.ts` (claims all pending msgs per run) | lock race → duplicate replies (R4) | A | P0 | 2 |
| F03 | Discovery by image/voice | 🟡 | voice transcription + photos in IG webhook lane | catalog image matching (embeddings) | A | P1 | 9 |
| F04 | In-chat checkout | 🟡 | storefront `/store/[slug]/checkout`, `packages/db/crud/store.ts` | tokenised checkout sheet `/c/[token]`, `checkout_sessions`, `delivery_options`, `coupons`, `POST /api/v1/store/{slug}/checkout-sessions`, `GET/POST /api/v1/checkout/{token}` (GLM spec) | A+B | P0 | 4 |
| F05 | FB comment automation + memory | ✅ | `packages/agent/tools/comment.ts`, `comment-runner.ts`, `comment_threads` | cross-channel customer memory check | A | P1 | 10 |
| F06 | Order management | 🟡 | `/b/[id]/orders`, `apps/api/src/routes/orders.ts` | customer DM on status change; public tracking `/api/v1/track/{token}` | A+B | P0 | 1 |
| F07 | AI order edits pre-confirm | 🟡 | `agentState.lastOrder` | agent tools for address change/cancel + new receipt | A | P1 | 8 |
| F08 | Stock + CRM | 🟡 | `variants.stock`, `/customers/[id]` | out-of-stock reply rule, return rate, courier success by region | A | P1 | 11 |
| F09 | Courier booking + tracking | ❌ | none (no Steadfast/Pathao) | courier adapter, "Book parcel", status webhooks, WISMO answers | A | P1 | 6 |
| F10 | Follow-ups & broadcasts | ❌ | — | leads pipeline, 24h-window broadcast, abandoned-cart nudge (Meta policy) | A+B | P2 | 13 |
| F11 | Human takeover + copilot | ❌ | no per-conversation AI switch | pause AI per conversation (agentState flag, no migration), toggle in inbox, summary/draft | A+B | P0/P1 | 5 |
| F12 | Complaint tickets | ❌ | — | sentiment detect, ticket table + owner/status | A+B | P2 | 14 |
| F13 | No-code training / KB | 🟡 | `agents.systemPrompt`, guidance, `/playground` | unanswered-questions list, rule editor | B | P1 | 12 |
| F14 | Analytics | 🟡 | `/b/[id]/analytics`, token-analytics | AI vs human msgs, AI-attributed orders, hot leads | B | P2 | 15 |
| F15 | Pay-per-use billing + onboarding | 🟡 | `/billing`, `plans`, `quota_usage` | per-reply ledger, practice mode, quota must fail closed | A | P2 | 16 |

## Bugs / risks (from GLM review + this audit)
| # | Issue | Status |
|---|---|---|
| R1 | Meta webhook signature not enforced | **fixed** `8025096` (403; `META_WEBHOOK_SIGNATURE_MODE=log-only` opt-out) |
| R2 | Public checkout non-atomic, no rate limit, base-price sale w/o variant | **fixed** `6c2cf87` (pre-validation, compensation, 429, count≤999). Idempotency key: open |
| R3 | `onDelivery` vs `ondelivery` breaks Advance/Revert/filter | **fixed** `a754f57` |
| R4 | Conversation lock race (35s stale) → duplicate replies | **open** (agent attempt stalled; needs CAS on `last_state_at`) |
| R5 | No order state-transition validation (restock exploit) | **fixed** `f736edd` |
| S1 | `admin123` default console password | **fixed** `861cdb4` |
| S2 | Operator email substring match; CORS reflects any origin w/ credentials | **fixed** `1126a71` |
| S3 | 100-message cap without cursor; quota fails open; `/doc` public | open |
| Q1 | `tsc -p tsconfig.typecheck.json`: 172 pre-existing errors | open (C) |
| Q2 | Brand string `OnlyOrdes` typo (deliberate default in `apps/web/lib/brand.ts`) | ask owner |

Deps/risks: Meta App Review for permissions; courier APIs (Steadfast/Pathao) need merchant keys; neon-http has no interactive transactions (use guarded updates/compensation or switch to the WebSocket pool for real transactions); shared Neon DB is used by local dev — keep e2e read-only.

## Acceptance criteria + tests (P0)
- **F06 notify**: on a state change of an order that has `conversationId`, exactly one DM in the conversation language; none for unchanged state or no conversation; HTTP 200 even if the send fails. Test: `tests/api/order-status-notify.test.ts` (mock `sendMessage`).
- **F06 transitions**: allowed chain pending→acknowledged→onDelivery→done; done is final (409); delete restocks only pending/acknowledged, once. Test: `tests/api/order-state-transitions.test.ts` ✅.
- **F11 pause**: `PATCH /{biz}/conversations/{id}/ai {paused}`; paused → runner makes no model call/send, inbound saved; 404 cross-business. Tests: `tests/api/conversation-ai-pause.test.ts`; e2e toggle.
- **F04 checkout sheet**: token single-use, expires; server-computed totals; atomic; rate-limited; mobile-first sheet. Tests: API + Playwright mobile.
- **F01 inbox**: cursor pagination beyond 100 msgs; filters; fetch errors show error state. Tests: API pagination + e2e.
- **R4**: a runner finishing after a takeover does not overwrite state; clients cannot set `working`. Test: `tests/lib/conversation-lock-race.test.ts`.
- Global: `bun run test` green; e2e `npx playwright test` green desktop+mobile; no new tsc errors in touched files.

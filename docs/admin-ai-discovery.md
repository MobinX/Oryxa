# Discovery — admin AI channels

Worktree: `/workspace/oryxa-admin`, branch `admin-ai-channels`. No `.env` files were read; only variable NAMES were collected (`.env.example`, code references).

## Stack

| Layer | What |
|---|---|
| Runtime | Bun monorepo; API = Hono (apps/api `:3001` via `API_PORT`, deployed on Vercel via apps/api2 as `oryxa-api2`); Web = Next.js 16 app router (apps/web) |
| DB | Postgres (Neon serverless) + Drizzle ORM 0.39, drizzle-kit; migrations are hand-tended SQL in `packages/db/migrations` with `meta/_journal.json` (35 files, latest `0034_admin_channels_and_messenger_notifications`), idempotent style (`IF NOT EXISTS`, `DO $$`) |
| Tests | vitest + in-memory PGlite (`tests/helpers/pglite-db.ts` runs `migrate()` over `packages/db/migrations`, swaps the DB client via `setTestDatabase`); `tests/neon` is the live-DB suite (never run here); e2e Playwright in `e2e/` |
| Auth | Firebase Admin ID-token verification (`apps/api/src/middleware/auth.ts`), non-prod bypass `dev-test-token`; admin console (web `/admin`) uses an HMAC cookie session signed with `LOGS_UI_PASSWORD` (`apps/web/lib/logs-session.ts`); all `/api2` admin routes gated by `logsAuthMiddleware` (operator bearer **timing-safe** or allowlisted `LOG_QUERY_USER_IDS` Firebase user) |
| AI | LangChain: Google Gemini (`GEMINI_API_KEY`, `gemini-flash-lite-latest`) or OpenAI/Azure (`OPENAI_API_KEY`/`AZURE_API_KEY`, `OPENAI_MODEL`, Responses API) selected in `packages/agent/Agent.ts` and `apps/api/src/routes/posts.ts`; React-style agent via `createReactAgent`; language handling (Bangla/Banglish/English) + reply sanitizer (prompt-leak detection) in `packages/shared/language.ts` |
| Messaging | `packages/integrations/facebook.ts` (Graph v21: OAuth + signed state, pages, Messenger Send API, webhook HMAC verify, comments, private replies), `instagram.ts`, webhooks `apps/api/src/webhooks/facebook.ts` (GET hub.challenge w/ `META_VERIFY_TOKEN`; POST X-Hub-Signature-256 HMAC timing-safe, fail-closed by default, `META_WEBHOOK_SIGNATURE_MODE=log-only` opt-out). WhatsApp: only an enum value; **no implementation** |
| Idempotency | messages/comments have `externalId` unique indexes; conversation/comment-thread run locks (`claim*ForAgentRun` + stale reset, `STALE_RUNNER_MS=35s`); quota counters atomic conditional upsert |
| Admin panel | web `/admin/*`: dashboard, plans, channels (operator FB pages), token-analytics, default-agent editor, agent-playground, logs, settings. Gate: `requireConsoleBearer()` via `logsBearer()`; login = Firebase operator account (`/admin/login`) |
| Jobs | None scheduled. Work runs inline on Vercel (Meta 20s window) or background (`runInBackground`) + cross-process self-POST `/internal/run` (`AGENT_RUNNER_URL`) |
| Env seen (names only) | `DATABASE_URL`, `META_APP_ID/SECRET/VERIFY_TOKEN/REDIRECT_URI/BUSINESS_MANAGEMENT/WEBHOOK_SIGNATURE_MODE`, `LOGS_UI_PASSWORD/USER`, `ADMIN_EMAILS`, `ADMIN_SIGNIN_EMAIL/DOMAIN/PASSWORD/NAME`, `LOG_QUERY_USER_IDS`, `INTERNAL_KEY`, `AGENT_RUNNER_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY/MODEL/BASE_URL`, `AZURE_*`, `B2_*`, `WEB_URL`, `NEXT_PUBLIC_API_URL`, `COMPANY_NAME`, `TESTING` |

## Conventions observed

- CRUD: flat named async fns in `packages/db/crud/*.ts`, zod-validated inputs from `@repo/shared`; ownership assertions before writes (`ChannelTakenError`, `ChannelAgentError`).
- Admin API: raw `OpenAPIHono` routes behind `logsAuthMiddleware`, mounted on `/api2` in `app.ts`.
- Web admin pages: server components calling `lib/api.ts` helpers (`signInPath: null` for `/api2`), client form components + server actions (`app/actions/*`) with `revalidatePath`; custom Tailwind v4 UI kit in `components/ui`.

## Existing coverage vs spec A–K

- A: FB connect fully (merchant + operator/admin-only pages), IG merchant connect. Missing: admin IG connect, WhatsApp, health/verify (debug_token), per-channel AI toggles.
- B: platform default agent (systemPrompt+guidance editor) and store overrides exist. Missing: per-channel AI studio (business profile, knowledge/FAQ, toggles, thresholds, escalation, sandbox test — playground exists as `/admin/agent-playground` and can be linked).
- C: absent (capacity/waitlist).
- D: CRM `customers` exists (phone-based per company) — different entity; leads absent.
- E: merchant inbox per store exists (`conversations`+`messages` w/ quota, dedupe). Missing: operator unified cross-channel inbox w/ AI-vs-human marking + handoff gate.
- F: comment ingestion + agent + persistPageReply w/ dedupe exists; per-channel comment behavior config absent.
- G: largely present (OAuth state/CSRF, webhook verify, event normalization, retries/stale recovery, quota). Missing: **AES-256-GCM token storage** (tokens currently plaintext `channels.api_token`), WhatsApp.
- I: see below.
- J: prompt-leak sanitizer exists; consent/retention/STOP absent for WA.

## admin123 audit (spec I) — status

Findings with `rg admin123` (all paths, `.env*` excluded):

| Location | What it is | Verdict |
|---|---|---|
| `apps/api/src/middleware/logs-access.ts:34`, `apps/web/lib/logs-session.ts:15` | **username** display default `LOGS_UI_USER` fallback `'admin123'` | Legacy default username, not a password. Password default removed in commit `861cdb4` (S-02 fixed, see `docs/security-test-report.md`) |
| `apps/api/src/lib/operators.ts:8` | `DEFAULT_OPERATORS = ['admin123@oryxa.app', 'mobin.devx@gmail.com']` fallback allowlist | hardcoded identity default; repo's own report S-13 flags it |
| `apps/api/scripts/create-operator.ts:24` | `localPart` default `'admin123'` → operator account email `admin123@oryxa.app` | provisioning default |
| `tests/lib/operators-cors.test.ts`, `tests/api/logs.test.ts:332-337` | negative tests: `admin123` bearer **must be rejected** | keep (they assert admin123 is unusable) |
| docs/*.md | documentation | keep |

No hardcoded password anywhere: `LOGS_UI_PASSWORD` has no default in web or api; `ADMIN_SIGNIN_PASSWORD` is required by the create-operator script for new accounts; Firebase handles strong-hash + session cookies are HttpOnly/Secure/SameSite=lax. **Action taken:** remove every `admin123` literal from code (defaults → `operator` / owner email default limited to `mobin.devx@gmail.com`), add dev-facing rotation docs, keep negative tests. Live DB/production rotation cannot be done from here (no live-DB access) — flagged for owner in delivery doc.

## Risks / blockers found

- Neon **http driver cannot use transactions** — capacity slot reservation must be a single atomic conditional UPDATE (precedent: `quota_usage` spend in `crud/billing.ts`).
- Next.js 16 breaking-changes notice in `apps/web/AGENTS.md` — consult `node_modules/next/dist/docs/` before adding pages.
- `lib/api-generated.ts` does not exist; the web client is the hand-written `lib/api.ts`.
- Facebook comment webhook delivery of "private replies" uses existing `sendCommenterMessage`; Instagram comments DM ~24h/7d windows outside scope of full enforcement but noted.

# Security test report — OnlyOrders (MobinX/Oryxa) · 2026-10-22 (Asia/Dhaka)

Scope: local box, `main` @ `eb98180` + local commits. Methods: `bun audit`; gitleaks 8.28.0 (git history + working tree, `--redact`); unauthenticated/forged-credential HTTP probes against local API `:3500` and web `:3400`; code review (GLM-5.3 review `docs/glm-feature-specs-review.md` + manual). No secret values were printed or sent to any model.

## Findings
| ID | Sev | Component | Evidence | Recommendation | Status |
|---|---|---|---|---|---|
| S-01 | High | Meta webhook | `apps/api/src/webhooks/facebook.ts` accepted invalid/missing `X-Hub-Signature-256` | Enforce | **Fixed** `8025096`, tests in `tests/webhooks/*` |
| S-02 | High | Log console | `admin123` default password in `apps/api/src/middleware/logs-access.ts`, `apps/web/lib/logs-session.ts`; the project env file itself had `LOGS_UI_PASSWORD=admin123` | No default; rotate | **Fixed in code** `861cdb4`; local `.env` rotated to random (stored `~/.secrets/onlyorders-local-console.env`). **Owner must rotate in Vercel.** |
| S-03 | High | Public checkout | non-atomic loop, no rate limit, no stock check without variant | Validate/compensate/limit | **Fixed** `6c2cf87` (idempotency key still open; limiter is per-instance) |
| S-04 | High | Orders | any→any state; done→pending→DELETE restocks shipped goods | Transition table | **Fixed** `f736edd` |
| S-05 | Med | Operator access | `ADMIN_EMAILS?.includes(email)` substring match + hardcoded emails (`middleware/business.ts:15`, `routes/businesses.ts:49`) | Exact match helper | **Fixed** `1126a71` (defaults kept only while `ADMIN_EMAILS` unset) |
| S-06 | Med | CORS | `app.ts` reflected any Origin with `credentials:true` | Allowlist | **Fixed** `1126a71` (`WEB_URL` + `CORS_ORIGINS`, localhost only non-prod) |
| S-07 | Med | Logging | raw message bodies + signature headers logged | Log lengths/ids | **Fixed** (webhook lane) `8025096` |
| S-08 | Crit (deps) | `next` ^16.3.0 resolved <16.3.6 | GHSA-vcvr-r3jv-pc5j (next/og RCE), GHSA-2xp9-vwfh-vxw4 (AVIF optimizer RCE) | Bump `next` ≥16.3.6 | Open |
| S-09 | Crit/High (deps) | handlebars 4.7.9, shell-quote 1.9.0, tinypool 1.1.1 (dev), vite/vitest (dev) | `bun audit`: 104 vulns (10 crit, 49 high, 40 mod, 5 low) | `bun audit fix`, vitest ≥4.1.11 | Open |
| S-10 | Med | Conversations | lock race → duplicate replies; client may set `working` | CAS + forbid | Open (R4) |
| S-11 | Med | Quota | gates fail open (`quota.ts` ~93) | Fail closed on errors | Open |
| S-12 | Low | API docs | `/doc` OpenAPI public (200) | Gate in prod | Open |
| S-13 | Low | Operator username | `LOGS_UI_USER` default `admin123` | Require env | Open (low now that the password has no default) |
| S-14 | Info | Secrets in git | gitleaks history: 2 generic-api-key hits, both test fixtures (`tests/webhooks/facebook-events.test.ts`, `tests/lib/log.test.ts`) | Confirm fake | Review |

## Auth probes (local)
`/api/v1/businesses`, `/api/v1/users/me`, `/api2/logs`, `/api/v1/admin/default-agent` → **401** with no token, junk bearer and `admin123` bearer. Web `/.env` 404; `/admin`, `/admin/logs` render the login/unauthorized gate; `/api/webhooks/instagram` unsigned → 403. Playwright login with the merchant test user succeeds and reaches dashboard/inbox/orders/products/customers (desktop + mobile).

## Secrets handling
`.env*` git-ignored (`.gitignore`: `.env*`, `**/.env*`); root `.env` chmod 600, copied from `~/.secrets/oryxa.env`; no env file tracked (`git ls-files`). Tests force `DOTENV_CONFIG_PATH=/dev/null` and a test-only console password so the suite never uses real credentials. Local dev servers DO use the real shared Neon DB/Firebase — e2e is read-only.

## Next steps
1. Rotate `LOGS_UI_PASSWORD` (and anything else in the env file that was ever shared) in Vercel; set `ADMIN_EMAILS`, `CORS_ORIGINS`.
2. Confirm production `META_APP_SECRET` is correct **before** deploying S-01 (else all webhooks 403; temporary `META_WEBHOOK_SIGNATURE_MODE=log-only`).
3. Upgrade `next` ≥16.3.6 and run `bun audit fix`.
4. Fix S-10/S-11, add checkout idempotency + shared rate limiting.

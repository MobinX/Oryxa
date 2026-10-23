# Security Audit — OnlyOrders (mercury-3) — 2026-10-22

Scope: `/workspace/oryxa` (apps/api Hono, apps/api2, apps/web App Router route
handlers/actions, packages/db + Agent + integrations, tests/). Webhook, upload,
internal, operator/logs, public storefront/checkout, OAuth callback, and every
`/api/v1/{businessId}/*` business-scoped route reviewed. No secrets printed.

## Summary

The codebase is strongly hardened. Every business-scoped route is behind
`authMiddleware` + `businessAccessMiddleware` (ownership), internal/agent routes
are behind `internalAuthMiddleware` (shared key, constant-time compare), and the
operator/logs console is behind `logsAuthMiddleware` (operator secret or
allowlisted Firebase user, fail-closed in production). SQL is fully
parameterized. Order prices are computed server-side. Webhook signatures are
enforced in production. CORS is an allowlist, not a reflect. No hardcoded
secrets, and only `.env.example` is tracked.

No exploitable High/Medium vulnerability was found that warranted a code change.
Two fixes from this session are already on disk (uncommitted): AUD-01 and the
F2 test repair. Remaining items are low-severity hardening notes (AUD-10–13)
that are deliberate or infrastructure-dependent.

## Findings

| ID | Sev | Location | Finding | Status |
|----|-----|----------|---------|--------|
| AUD-01 | Low | `apps/web/next.config.ts` | `poweredByHeader` not disabled (leaks `X-Powered-By: Next.js`); also `productionBrowserSourceMaps` left on in a workspace that ships a merchant console. | **Fixed** (uncommitted) — both set `false`; covered by `tests/lib/web-next-config.test.ts` |
| AUD-02 | n/a | `tests/lib/web-next-config.test.ts` | Rebuilt against structural types (no `import 'next'` which failed at root typecheck). 5 assertions pass under vitest; root typecheck clean for the file. | **Fixed** (uncommitted) |
| AUD-03 | Verified | `apps/api/src/middleware/auth.ts` | Firebase ID token verified; dev bypass gated on `ALLOW_DEV_AUTH_BYPASS` **and** non-production. | OK |
| AUD-04 | Verified | `business.ts` + per-router mounts | `verifyBusinessOwnership` on `businessId` param; operator bypass restricted to `oryxa-sandbox`. Mounts checked: products, customers, orders, channels, conversations, posts, uploads, token-analytics, push, billing, messenger-notifications. | OK |
| AUD-05 | Verified | `internal-auth.ts`; `/internal/*` | Constant-time compare, `MIN_INTERNAL_KEY_LENGTH=16`, no default. `/internal/test-run`/`test-comment-run` mounted under `internalRouter` so they require the key. | OK |
| AUD-06 | Verified | `logs-access.ts`; `/api2/admin*`, logs | Operator secret timed-safe compare, min 12, "change-me" rejected; allowlist check; anonymous/unauth denied in production. | OK |
| AUD-07 | Verified | `packages/db/crud/*` | All Drizzle query-builder calls; the only `sql\`…\`` uses are parameterized (`sql\`${x}\``) or `sql.identifier` of a compile-time constant. No string interpolation into SQL. No injection. | OK |
| AUD-08 | Verified | `packages/db/crud/order.ts` | Unit price derived from catalog (product/variant), never from request; stock update uses `WHERE stock >= count`; race soft-deletes order. No price tampering. | OK |
| AUD-09 | Verified | `apps/api/src/webhooks/facebook.ts` | `x-hub-signature-256` HMAC verified against `META_APP_SECRET`; `log-only` mode refused in production; invalid signature → 403 (non-log-only). Body parsed only after verification. | OK |
| AUD-10 | Low | `packages/integrations/facebook.ts` `fetchMessengerImage`/`fetchMessengerAudio` | Attachment URLs are fetched server-side with no scheme/host allowlist. Practical risk is low: the delivery payload is Meta-signed and attachment URLs are Meta CDN links. | Recommended hardening (not changed — see note) |
| AUD-11 | Low | `apps/api/src/routes/store.ts` checkout | Rate-limit keyed on client-supplied `cf-connecting-ip`/`x-real-ip`/`x-forwarded-for`. Trustworthy on Vercel behind their proxy; if the API is ever exposed directly these are spoofable. | Recommended hardening (infra-dependent) |
| AUD-12 | Info | `customers.ts` → `getCompanyIdForBusiness` | Customer data is scoped to the **company**; two businesses under one company share customers. Matches product intent but confirm cross-business visibility is intended. | Note |
| AUD-13 | Info | `apps/web/lib/operator-login.ts` comment | Comment claims `POST /api/v1/users/sync` is unauthenticated; the route actually runs `syncAuthMiddleware` and writes the verified Firebase identity's email, not the request body. Comment is stale; behavior is correct. | Note |
| AUD-14 | Verified | `apps/api/src/lib/cors-origins.ts` | Origin allowlist; no reflection; `credentials: true` only for allowlisted origins. | OK |
| AUD-15 | Verified | `layout.tsx:36`, `glow.tsx:68`, `storefront-preview.tsx:73`, `storefront-shell.tsx:194` | `dangerouslySetInnerHTML` only for static internal CSS/JS constants; no user-controlled data. | OK |
| AUD-16 | Verified | repo | Only `.env.example` tracked; `.env`/`*.env` ignored (chmod 600); no hardcoded secrets in source. | OK |

### AUD-10 note
A guard that requires `https:` and rejects private/reserved IP literals would be a
reasonable defense-in-depth addition. It was deliberately **not** implemented in
this pass because it touches live media delivery and the signing gate already
precludes an attacker from choosing the URL. Revisit if the webhook is ever run
outside production signature enforcement.

### AUD-11 note
If the Hono API is deployed behind any proxy that sets `X-Forwarded-For`, the
value is only trustworthy when that header comes from the trusted proxy. Keeping
the current logic is fine on Vercel; document the trust boundary before any
direct deployment.

## Files changed (uncommitted)
- `apps/web/next.config.ts` — `poweredByHeader: false`, `productionBrowserSourceMaps: false` (AUD-01).
- `tests/lib/web-next-config.test.ts` — rewritten to structural types + assertions (AUD-02).
- `docs/security-audit-mercury-2026-10-22.md` — this report.

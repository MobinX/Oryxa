# Project assessment — OnlyOrders (GitHub MobinX/Oryxa) · 2026-10-22

> The first pass (phase 1) assessed the wrong repo: `Zul-Qarnain/oryxa`, a static Vite landing site, now at `/workspace/oryxa-landing`. This file covers the real product monorepo.

- **Repo**: `MobinX/Oryxa`, public; default branch `main` @ `eb98180` (2026-10-21, Mohammd Shihab Hossain). 12 remote branches (feat/*, copilot/*, system-update-0{1,2,3}-argon, imgbot), 2 open PRs (#1 imgbot, #2 comments WIP). No submodules.
- **Stack**: Bun workspaces. `apps/api` Hono + zod-openapi on Bun (:3500, Vercel handler `api/index.ts`); `apps/api2` Next.js (Vercel); `apps/web` Next.js 16 dashboard + marketing + storefront (:3400; proxies `/api/v1`, `/api2` to the API); `packages/db` Drizzle + Neon (migrations up to 0034); `packages/agent` LangChain/Gemini agent; `packages/integrations` Meta Graph + B2; `packages/shared` zod schemas.
- **Auth**: Firebase (ID token bearer; `dev-test-token` in tests); businessAccessMiddleware ownership; operator console via `LOGS_UI_PASSWORD` or allowlisted user ids.
- **Backend location**: in this repo. Env URLs (`AGENT_RUNNER_URL`, `NEXT_PUBLIC_API_URL` = localhost:3500, `WEB_URL` = localhost:3400) are local-dev values. The GitHub homepage is `https://oryxa-api.vercel.app`. The deployed Vercel/oryxa.us hosts could not be reached from the box (sandbox DNS), so testing runs against the local stack, which uses the real shared Neon DB, Firebase and Meta.
- **Commands**: `bun install`; `bun run dev:api` / `dev:web`; `bun run test` (vitest + PGlite; `tests/neon` hits the shared DB — opt-in only); `bun run typecheck`; `bun --filter web build`; e2e `npx playwright test` (needs a running web app; test user from `~/.secrets/onlyorders-test-user.env`).
- **Baseline**: vitest 71/72 files, 638 pass, 5 skipped, 1 flaky PGlite hook timeout; typecheck **172 pre-existing errors**; local API + web start fine; Playwright 14/14 (desktop + mobile, merchant login).
- **Docs in repo**: README.md, ARCHITECTURE.md, architecture.md, agent.md, project.md, `.agents/` (rules/workflows), `apps/web/AGENTS.md`/`CLAUDE.md`.

# AGENTS.md — OnlyOrders (repo MobinX/Oryxa)

The product is **OnlyOrders**. Do not rename the GitHub repo.
Bun monorepo: apps/api (Hono), apps/web (Next.js 16), apps/api2, packages/{db,agent,integrations,shared,utils}, tests/ (vitest+PGlite), e2e/ (Playwright). See `docs/project-assessment.md`, `docs/implementation-roadmap.md`, and the repo's own `.agents/`.

## Roles
- **A — Backend**: apps/api, packages/db/agent/integrations, migrations (never applied to the shared DB without approval).
- **B — Integration/UI**: apps/web pages/components, storefront, inbox, landing showcase.
- **C — QA/Security**: tests, typecheck, build verification, secret hygiene and review of A/B diffs. C must approve before anything is proposed for push.

## Model routing (from docs/agent-benchmarks.md)
- Heavy work (features, debugging, integration): `claude-omni` with `OMNI_MODEL=claude-opus-5.5-mycopy`, fallback `amazon-omni`/`amazon-omni-copy`; Qoder Qwen3.8-Max/GLM-5.3 as backup.
- Light work (docs, small edits, simple tests): cursor/*, codex/gpt-5.6-luna-medium, agy/*, grok-cli/grok-4.6.
- OmniRouter stalls with more than about 3 concurrent agent sessions. Run at most 3 at once, in separate git worktrees with NO .env.
- Cheap or fast tasks: `subagent-fast-combo` (chat only; not reliable for agentic edits).
- Qoder (`qoder-auth -m <Model>`): use it when its quota allows. The router's `qoder`/`qoder-model` combos were quota-exhausted on 2026-10-22.
- GLM Code app is desktop-only and was not benchmarked headless.

## Commands
`bun install` · `bun run dev:api` · `bun run dev:web` · `DOTENV_CONFIG_PATH=/dev/null bun run test` · `bun --filter web build` · `npx playwright test`. Never run `tests/neon` (shared DB) without approval. Done = related tests + web build green, no NEW tsc errors in touched files (baseline has 172).

## Token-saving tools (mandatory)
- `rtk` wraps noisy shell commands (e.g. `rtk git status`, `rtk npm run build`).
- `headroom` handles context compression/caching.
- `caveman`: terse output mode. Keep replies short.
- `graphify` builds the codebase knowledge graph. Query it before reading many files.

## Security rules
- Secrets live in `~/.secrets/*.env` and in the git-ignored, chmod-600 `.env`/`*.env` files. **Never** print, commit, log or send secret values to any model or prompt. Agents may read key NAMES only.
- Only `.env.example` (names only) may be committed.
- Do not create accounts to get around quotas.

## Git rules
- **NO `git push`, PRs, releases or deploys without the user's (Mazharul) explicit approval.**
- Local commits are OK, authored as `Zul-Qarnain <68942280+Zul-Qarnain@users.noreply.github.com>`. Friends may push to `main`, so `git fetch` and rebase before starting work.

## Docs
`docs/project-assessment.md`, `docs/agent-benchmarks.md`, `docs/agent-prompt.md` (task template).

# Agent benchmarks — 2026-10-22 (Asia/Dhaka)

> Note: these benchmark tasks ran on the landing-site repo (Zul-Qarnain/oryxa), not this monorepo. Model ranking still applies; OmniRouter later proved unstable under more than about 3 concurrent sessions, and Qoder credits ran out on 2026-10-22.

Each run used a fresh git worktree off `0ade6f5`, the same prompt and the same scripted acceptance check (scripts in /workspace/bench on the box).
- **T1**: add an `npm run typecheck` script and make the Footer year dynamic. Accept if typecheck passes, build passes, and Footer uses `getFullYear`.
- **T2**: add `src/lib/slugify.ts` and a node:assert test. Accept if a tsc-compiled `slugify` returns correct results on 2 cases and the build passes. The prompt's `--experimental-strip-types` npm script is invalid on the box's Node 20, so it was excluded from scoring for every agent (prompt flaw, not an agent flaw).

| Agent / model | T1 | T1 time | T2 | T2 time |
|---|---|---|---|---|
| Claude Code via OmniRouter `claude-opus-5.5-mycopy` (served as gpt-5.6-luna-medium) | PASS | 56 s | PASS | 122 s |
| Claude Code via OmniRouter `amazon-omni` (served as claude-sonnet-4-6) | PASS | 77 s | PASS | 148 s |
| qodercli `Qwen3.8-Max` | PASS | 262 s | PASS (output correct; killed before it exited) | >300 s |
| qodercli `GLM-5.3` | PASS | 270 s | PASS (output correct; killed before it exited) | >300 s |
| qodercli `Auto` | FAIL ("Queuing failed", quota) | 349 s | FAIL (no file) | – |
| OmniRouter `qoder` / `qoder-model` | n/a: HTTP 429, all qoder accounts out of quota (~24 h reset) | | | |
| OmniRouter `subagent-fast-combo` | chat ping returned tool_calls from llama-3.2-11b; not suitable for agentic work | | | |
| GLM Code app | not benchmarked (desktop-only, no headless mode) | | | |

**Routing:** primary is `claude-opus-5.5-mycopy` (fastest, correct). Second is `amazon-omni`. Use qoder Qwen3.8-Max or GLM-5.3 as a slower third option for parallel work.

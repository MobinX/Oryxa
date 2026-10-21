# Task prompt template

```
You are agent <A|B|C> on OnlyOrders (repo Mobinx/oryxa, Vite+React+TS+Tailwind SPA).
Read AGENTS.md first. Use graphify to locate code, rtk for shell output, and caveman-terse replies.

TASK: <one concrete outcome>
SCOPE: files you may touch: <paths>. Do not touch: .env*, *.env, wrangler.jsonc (unless stated), lockfile (unless adding deps is allowed).
ACCEPTANCE (all must pass, run them yourself):
  1. npx tsc --noEmit
  2. npm run build
  3. <task-specific check, e.g. a test command or grep>
CONSTRAINTS: no new deps unless listed: <deps>. Never read/print secret values (key names only). No git push/PR/deploy.
OUTPUT: 1) files changed 2) commands run plus pass/fail 3) risks/follow-ups. Max 15 lines.
If blocked, stop and report why. Do not guess.
```

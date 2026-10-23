# Admin panel revision + Official Channels (user direction, 2026-10-22)

Rules: work only in /workspace/oryxa-admin (branch admin-ai-channels). Never read/print .env or ~/.secrets. No push/deploy. Commit small increments locally (git -c user.name=Zul-Qarnain -c user.email=68942280+Zul-Qarnain@users.noreply.github.com commit). Follow existing conventions and theme. Real data only, no mocks/fake numbers in product code. Track progress in docs/admin-agenda.md.

## 1. Remove disliked AI-bot admin edits
Remove from the admin UI (and dead API routes/code only used by them): per-store bot "AI Studio" page and its sandbox, comment-rules/comments overview, capacity/waitlist tied to store bots, the store-bot lead capture wiring in the agent runner, admin Leads/Inbox pages built for store bots. Restore the store agent behaviour to what main had (git diff f83a1d8) except where needed for security.
KEEP: admin123 removal, provision-operators script, verifyIdToken checkRevoked, token encryption at rest (crypto.ts), bunServe fix, WhatsApp Cloud API client (reusable for Official Channels). KEEP migration 0035 tables in the DB (never drop); reuse leads/capacity tables if they fit, otherwise just leave them unused.

## 2. Real admin dashboard stats
The admin dashboard numbers (messages, orders, revenue, estimated cost, etc.) are fake/hardcoded. Replace with real DB aggregate queries (existing tables: messages, orders, token analytics etc.), with date range where sensible. Show honest empty/zero states.

## 3. Navigation/UI
Move admin top-bar navigation into a left sidebar (collapsible drawer on mobile). Keep existing theme and login page. Light polish.

## 4. NEW: Official Channels (admin-only, separate from store inboxes)
Connect OnlyOrders' OWN official accounts: Facebook Page, Instagram professional, WhatsApp Business Cloud API, TikTok (official TikTok APIs are limited for DMs — implement what's officially possible, document limits/blockers). Real official APIs only; never show "connected" unless verified.
- Incoming messages handled by an AI (existing AI provider in repo) that classifies intent: support ticket, security ticket, sales/onboarding inquiry, other.
- Ticket system: create/submit/track support & security tickets from conversations; statuses (open, in progress, waiting, resolved, closed), priority, assignee, notes, history.
- Availability switch: "Available" vs "Not available — taking onboarding requests"; AI wording follows it.
- Sales inquiries: AI progressively collects name, contact/platform ID, country, business type, estimated employees, budget/estimated cost, needs (with consent) and saves an onboarding prospect. Admin view: review, score/rank prospects by configurable criteria (weights), pick who to onboard first, status.
- Inbox for official channels: list, history, AI vs human marked, human takeover (AI never replies after takeover), resume, notes; idempotent webhooks (no duplicate replies), signature verification.
- All routes behind existing admin auth.
Architecture first: write docs/official-channels-plan.md (data model, routes, webhooks, AI flow, UI pages, TikTok limits), commit, then implement.

## DB
Reuse 0035 tables where fitting. Any new migration: additive only, with rollback SQL, tested on a disposable local DB (e.g. pglite/docker postgres) — do NOT apply to the shared Neon DB (needs owner approval).

## Tests
vitest (all green), `bun run build`, update e2e/admin-channels.spec.ts to cover sidebar, dashboard stats, official channels pages. Finish with docs/official-channels-delivery.md and print DONE.

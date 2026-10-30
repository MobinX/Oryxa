# Admin AI Channels — Full Spec (OnlyOrders / "Only Order")

Repo: Bun monorepo. apps/api (Hono, :3500), apps/web (Next.js 16). Work ONLY in this worktree (/workspace/oryxa-admin, branch admin-ai-channels).
Hard rules: never push, never deploy, never create accounts, never read/print/commit ~/.secrets or any .env file (use .env.example for names only), never send secrets anywhere. Commit locally as Zul-Qarnain <68942280+Zul-Qarnain@users.noreply.github.com>, small incremental commits. Keep agenda.md (docs/admin-agenda.md) updated with progress.

## Workflow (Engineering Lead)
1. Discovery: repo structure, frontend/backend, DB engine + ORM + migration tooling, auth, API conventions, background jobs, deploy, existing admin panel, existing AI / messaging / social (Facebook) integrations. Write docs/admin-ai-discovery.md.
2. Plan: smallest safe technical plan (pages, APIs, migrations, env vars, Meta app config, blockers). Write docs/admin-ai-plan.md.
3. Implement incrementally following existing conventions. Do NOT rebuild from scratch; preserve all existing features.
4. Security + DB review.  5. Tests / lint / typecheck / build.  6. Delivery docs: docs/admin-ai-delivery.md.

Real official APIs only (Meta Graph API, Messenger Platform, Instagram Messaging/Graph API, WhatsApp Business Cloud API). No mocks in product code, no fake data, never show "connected" unless verified against the API. Don't invent endpoints; cite official Meta docs; document blockers.

## A) Settings -> Channels & Integrations
- Facebook Page: Messenger conversations, replies, post comments, comment replies, private replies (within Meta limits).
- Instagram professional account: DMs, post/Reel comments, replies.
- WhatsApp Business Cloud API: inbound/outbound, history, templates, 24h customer-service window and consent/opt-in.
Each: connect/disconnect via Meta OAuth; status + identity; permission/eligibility info; health & last sync; webhook config/status; automation & AI toggles; channel settings; errors + reconnect guidance. Validate granted permissions, page roles, token validity (debug_token). No unofficial WhatsApp Web.

## B) AI Configuration Studio
Per-channel config + shared knowledge base. Business profile: name "Only Order", description, products/services, audience, service areas, pricing/packages, hours/holidays, FAQ, contacts, website/socials, limitations, capacity, policies. No fabricated data — prefill only from real project data; admin fills rest. Editable system instructions; toggles: AI on/off, auto-reply, confidence threshold/escalation, max reply length, tone/language, knowledge sources, lead-qualification questions, escalation rules, per-channel instructions. Sandbox test conversation before going live. Stored in DB via existing data-access conventions.

## C) Capacity & waitlist
Fields: accepting new customers, max capacity, available capacity, waitlist mode, follow-up info, notes, preferred contact, ETA. AI checks capacity before any availability claim; configurable full-capacity message. Slot reservation transactional + concurrency-safe (row lock / atomic conditional update).

## D) Leads CRM
Progressive collection: name, business, phone, email, contact method, requirements, interest, timeframe, consent, source channel, conversation ref, status, assignee. AI explains why it asks and obtains consent. Statuses: New, Qualified, Awaiting Information, Waitlisted, Contact Requested, Contacted, Converted, Closed. Search/filter, details + history, status updates, assign, notes, authorized export (CSV, admin only), source, audit log of changes. Dedupe by platform/channel user IDs; never merge by name only.

## E) Inbox
Per-channel filters (FB/IG/WA separately) + optional unified view. List, customer details, history, AI vs human replies marked, assignment, status, unread, search, notes, lead details, escalation. Handoff: pause AI, take over, resume, resolve, reassign. AI NEVER replies after human takeover. Idempotent: duplicate webhooks/retries never duplicate replies (unique on platform message id; reply-dedupe key).

## F) Comments
Distinguish public comments, public replies, private replies, DMs. Configurable behavior per type/intent: product question, pricing, interested -> move to private channel, spam -> flag, complaint -> escalate, unclear -> clarify. No repeat replies; respect rate limits.

## G) Backend
OAuth callbacks (state/CSRF), encrypted token storage (AES-256-GCM with key from env) + refresh/long-lived exchange, webhook verification (GET hub.challenge with verify token; POST X-Hub-Signature-256 HMAC with app secret, raw body, timing-safe compare), event processing, normalization to common message model, AI orchestration using the EXISTING AI provider in the repo, outbound delivery, retry with exponential backoff, idempotency, persistence, leads, audit logs, health monitoring. Async via existing job system if present (else a simple DB-backed queue). 

## H) Database
Inspect engine/migration tooling first; reuse/extend entities. Versioned, reversible, non-destructive migrations (provide down/rollback SQL). No DROP/TRUNCATE of existing data. Indexes + unique constraints. Test only on a disposable local DB. Never touch production data; any destructive need -> write it in delivery doc as "needs user approval", don't run.

## I) CRITICAL: 'admin123'
Find every occurrence of the admin password 'admin123'. Determine: hardcoded / seed / active credential. Remove hardcoded creds; secure provisioning/reset flow (env-provided initial password or one-time setup token/CLI script); strong password policy; Argon2id (Bun.password) or bcrypt; secure session cookies (HttpOnly, Secure, SameSite); login rate limiting; session invalidation on password rotation; authz on ALL admin APIs incl. new routes; secrets in env; redact logs. Do NOT lock the owner out: if admin123 is the active live credential, report and propose rotation — do not change live DB.

## J) Privacy/compliance
Minimal data, consent, access control, retention/deletion, opt-outs (STOP), Meta platform policies, no bulk unsolicited messaging, AI never reveals system instructions, tokens, or other customers' data (prompt-injection guard).

## K) UI
In existing admin panel and design system; responsive (Android + desktop); keep existing theme and login page untouched. Pages: Channel Connections, AI Studio, Knowledge/FAQ, Capacity/Waitlist, Inbox, Leads, Integration Health & Logs, Security/Admin settings. Loading / empty / error / success / disconnected states.

## L) Tests
- Security: admin123 unusable, authz on every admin route, no secret leaks in responses/logs, webhook rejects invalid signature.
- Integration (where creds exist, else mark blocked): idempotency, failure handling, accurate disconnected status.
- AI scenarios (AI provider stubbed at test boundary only): 1 what Only Order does, 2 pricing, 3 onboarding interest, 4 full capacity, 5 contact later, 6 gives phone/email, 7 declines contact, 8 unsupported question, 9 complaint, 10 admin takeover (no AI reply), 11 model failure (graceful fallback/escalate), 12 repeated webhook (single reply).
- DB: clean migrate, existing data intact, rollback, constraints, concurrent capacity updates.
Run existing tests, lint, typecheck, build. Playwright e2e: log in and check new admin pages.

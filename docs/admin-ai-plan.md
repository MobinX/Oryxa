# Plan — admin AI channels (smallest safe increments)

Repo already ships Messenger/IG channels + AI agent + idempotent webhooks + `/api2` operator console. This plan **extends**, never rebuilds. Track: docs/admin-agenda.md.

## Phase 0 — admin123 hardening (spec I)
1. Remove the `'admin123'` literal from: `logs-access.ts` + `logs-session.ts` (user default → `operator`), `operators.ts` `DEFAULT_OPERATORS` (→ `mobin.devx@gmail.com` only when `ADMIN_EMAILS` unset), `create-operator.ts` (local part default → `operator`; require `ADMIN_SIGNIN_PASSWORD` ≥ 12 chars for new accounts).
2. Update affected tests (`operators-cors`, `logs`); keep the negative "admin123 bearer rejected" tests.
3. Document owner rotation steps (env `ADMIN_EMAILS`, `LOGS_UI_USER`) — no live DB change from here.

## Phase 1 — migration `0035_admin_ai_channels` (+ rollback SQL)
New tables (all nullable/append-only, no data loss):
- `channel_ai_configs` (1:1 `channels`): ai_enabled, ai_comments_enabled, private_replies_enabled, auto_reply, confidence_threshold, max_reply_length, tone, language, per_channel_instructions, lead_questions jsonb, escalation_rules jsonb, comment_behavior jsonb.
- `business_profiles` (1:1 `businesses`): display_name default 'Only Order', description, products_services, audience, service_areas, pricing_packages, hours_holidays, contacts, website, socials, limitations, policies.
- `knowledge_entries` (per business FAQ, soft-delete).
- `capacity` (1:1 `businesses`): accepting_new_customers, max_capacity, available_capacity, waitlist_mode (off/auto/manual), full_capacity_message, follow_up_info, preferred_contact, eta_text, notes.
- `capacity_reservations`: active status, released_at; unique lead.
- `leads`: business/channel refs, platform (existing pgEnum), platform_user_id, name/business_name/contact_method/requirements/interest/timeframe/consent(+at)/source_channel/status enum `lead_status` (new…closed)/assignee_user_id/notes; **unique (business_id, channel_id, platform_user_id)** — dedupe by platform ids only.
- `lead_events`: actor_kind (operator|ai|system), actor_user_id, kind, data jsonb, created_at.
Alters: `messages` +`sent_by` varchar(10) null ('ai'|'human'); `conversations` +`ai_paused` bool false.
Rollback script in `packages/db/migrations/rollback/0035_admin_ai_channels.down.sql`; proven by a test on a disposable PGlite DB applying up→checks→down.

## Phase 2 — token encryption + WhatsApp client (packages/integrations)
- `crypto.ts`: AES-256-GCM, key from `MESSAGES_ENCRYPTION_KEY` (base64 32 bytes). Cipher-text format `v1:<iv>:<tag>:<ct>` inside existing `channels.api_token`; plaintext legacy values still read (decrypt passthrough) so nothing breaks until next write.
- Decrypt at every read that ships a token out of crud; encrypt on every write in `crud/channel.ts`.
- `whatsapp.ts`: Graph v21 Cloud API — verify number credentials (`GET /{phone-number-id}`), debug_token validity, send text (`POST /{phone-number-id}/messages`), list templates (`/{waba-id}/message_templates`), profile picture. Real endpoints only; block = credentials, documented.

## Phase 3 — webhooks + runner wiring (specs D/E/F)
- `/webhooks/whatsapp` GET verify + POST HMAC verify (same `META_VERIFY_TOKEN`/`META_APP_SECRET`); normalize Cloud API `messages` events into `conversations`/`messages` (channel platform 'whatsapp', `platform_channel_id` = phone-number-id; `extraInfo` holds waba/phone/display name). Upstream business verified via Graph call before save; support upstream verification... wait: before save; statuses (delivery/read) recorded as log events only.
- New `apps/api/src/lib/lead-capture.ts`: after every persisted inbound turn (DM + comment), upsert lead (dedupe by channel + platform user id), regex-capture phone/email/name beats, consent statements; write `lead_events`.
- Runner gates in `agent-runner-core` (+ `comment-runner`): skip AI when `channel_ai_configs.ai_enabled=false`/`ai_comments_enabled=false`... wait — verify exact config names from schema table (aiEnabled/aiCommentsEnabled) before writing tests.
- Runner: skip AI when `conversations.ai_paused` (human takeover) or channel config disabled; inject context block (capacity status + full-capacity message, business profile, top knowledge entries, lead-collect instructions + why-explains, per-channel instructions, escalation rules) into the Agent's system context; mark fallback + tool replies `sent_by='ai'` (human dashboards sends → `sent_by='human'`).
- Capacity reservation consumed on order creation is out of scope; reservation/release is operator-driven + atomic UPDATE with `available_capacity > 0` guard (Neon-http has no transactions), release capped at max.

## Phase 4 — admin API (spec G, mounted `/api2/admin/ai/*`, `logsAuthMiddleware` everywhere)
- `GET /admin/ai/channels` list (all platforms + config + who holds), `GET|PUT /admin/ai/channels/{id}/config`, `POST /admin/ai/channels/{id}/verify` (Graph checks: token debug + page/number credentials), `POST /admin/ai/channels/{id}/ai-toggle`.
- `GET/PUT /admin/ai/capacity/{businessId}`, `POST /admin/ai/capacity/{businessId}/reserve|release`.
- `GET|PUT /admin/ai/business-profile/{businessId}`, `GET/POST/PUT/DELETE /admin/ai/knowledge/{businessId}` (+ action import/export for admin CSV).
- `GET /admin/ai/leads` (search/status/channel filters) + `GET /admin/ai/leads/{id}` (+ events) + `PATCH /admin/ai/leads/{id}` (status/assignee/notes + audit) + `GET /admin/ai/leads/export.csv` (admin bearer only) + `DELETE` soft-delete, PATCH history landed in lead_events.
- `GET /admin/ai/inbox?platform=facebook|instagram|whatsapp|unified` (preview threads across channels w/ AI paused flag, lead pointer, sent_by on messages; takeover/resume + reply routes) and `PATCH /admin/ai/inbox/thread/{id}/pause|resume`, `POST /admin/ai/inbox/{conversationId}/reply` (human send via platform integration; marks `sent_by='human'`), `POST /admin/ai/comments/{threadId}/reply` public or private.
- WhatsApp connect: `POST /admin/ai/channels/whatsapp/connect` {phoneNumberId, accessToken, wabaId?} → Graph verify (number + debug_token) → channel row. No OAuth exists for Cloud API; documented as a blocker w/ Meta setup steps.
- Instagram admin connect: reuse merchant IG flow pattern under `/api2/admin/channels/google`... — actually reuse `ADMIN_FACEBOOK_FLOW` on v2: `GET /api2/admin/channels/instagram/auth|pending` + `POST /api2/admin/channels/instagram/connect` (platform 'instagram', isAdminOnly pages skipped — IG admin channels mirror the FB admin flow).

## Phase 5 — web console pages (spec K, existing desktop + theme)
- `/admin/channels` extended: all-platform table (FB operator + store channels + IG + WA), connect flows incl. IG (mini admin picker page) + WA connect form, health/verify button, per-channel "AI settings" link.
- `/admin/ai-studio`: business selector → profile form, knowledge/FAQ CRUD, per-channel AI config editor (toggles/threshold/tone/instructions), link to existing playground for sandbox tests.
- `/admin/capacity`: per-business capacity editor + reservation/release + waitlist mode + full-capacity message.
- `/admin/inbox`: unified + per-platform filters, thread preview list, thread view w/ AI-vs-human marks, takeover/resume, human reply, resolve.
- `/admin/leads`: filters + search, detail w/ history/audit, status/assignee/notes actions, CSV export (admin only), detail route.
- `/admin/health`: live verify-all-channels button, webhook verify config status, recent errors from existing log query... — actually from `/api2/admin/ai/health-summary` + token usage link.
- New tabs appended to `components/admin-tabs.tsx`.

## Phase 6 — tests (spec L)
- `tests/db/migration-rollback.test.ts`: PGlite up + asserts + raw down + re-assert, plus capacity concurrency (two sequential conditional UPDATEs, second fails).
- Extend webhook tests: WA normalization + dedupe (repeat webhook = single reply), invalid WA signature 403, admin takeover gate.
- `tests/api/admin-ai-channels.test.ts` via the app router: 401 junk/no Bearer + admin123 bearer on every new route; route roundtrips on PGlite; no secrets in responses (token fields absent).
- AI scenarios (spec list 1–12): decision-layer tests w/ agent send overridden (fake LLM at boundary as spec allows): capacity full → full-capacity message, phone/email capture → lead fields, declines contact, takeover → no AI reply, model failure escalate/dedupe.
- Security: `admin123` token must be rejected by every admin route; no default password env; webhook rejects bad signature.
- Lint/typecheck/build + Playwright e2e for console pages w/ reachable routes.
- `tests/neon` never run.

## Decisions recorded
- WA connect = manual token (Cloud API has no end-user OAuth for this setup path); OAuth embed signup recorded as future work needing Meta Business verification.
- AI lead capture = wizard-less: prompt instructions + deterministic extraction (regex) on each turn; no new agent tool, minimal blast radius. Recorded as an extensibility point.
- `sent_by` legacy rows stay NULL — UI renders plain "Store".
- `META_WEBHOOK_SIGNATURE_MODE` left default `enforce` for new WA route; FB/IG behavior unchanged.
- Tests stub only at integration boundaries (fetch/model) per spec.

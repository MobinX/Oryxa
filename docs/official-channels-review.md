
> mercury-lead · mercury-3

→ Read docs/official-channels-plan.md
→ Read docs/official-channels-spec.md

$ rtk ls apps/api/src/webhooks/ apps/api/src/lib/ apps/api/src/lib/official/ 2>/dev/null; rtk ls apps/api/src/routes/ | head -50
apps/api/src/lib/:
total 176
-rw-r--r-- 1 box box 22800 Oct 22 23:02 agent-runner-core.ts
-rw-r--r-- 1 box box  1413 Oct 22 18:38 agent-runner.ts
-rw-r--r-- 1 box box  4690 Oct 22 18:38 agent-trace.ts
-rw-r--r-- 1 box box  4525 Oct 22 18:38 background.ts
-rw-r--r-- 1 box box  7773 Oct 22 18:38 catalog-summary.ts
-rw-r--r-- 1 box box 17706 Oct 22 23:02 comment-runner.ts
-rw-r--r-- 1 box box  6145 Oct 22 18:38 comment-test-runner.ts
-rw-r--r-- 1 box box   819 Oct 22 18:38 config.ts
-rw-r--r-- 1 box box  1073 Oct 22 18:38 cors-origins.ts
-rw-r--r-- 1 box box  1436 Oct 22 20:48 csv.ts
-rw-r--r-- 1 box box  3324 Oct 22 18:38 ctx.ts
-rw-r--r-- 1 box box  2011 Oct 22 18:38 db-log.ts
-rw-r--r-- 1 box box  7516 Oct 22 18:38 log-query.ts
-rw-r--r-- 1 box box 36501 Oct 22 20:41 log.ts
-rw-r--r-- 1 box box  4646 Oct 22 18:38 logmiddleware.ts
-rw-r--r-- 1 box box  1619 Oct 22 18:38 messenger-notify.ts
-rw-r--r-- 1 box box  1131 Oct 22 18:50 operators.ts
-rw-r--r-- 1 box box  3460 Oct 22 18:38 push.ts
-rw-r--r-- 1 box box  4939 Oct 22 18:38 quota.ts
-rw-r--r-- 1 box box   667 Oct 22 18:38 rate-limit.ts

apps/api/src/webhooks/:
total 72
-rw-r--r-- 1 box box 58852 Oct 22 20:41 facebook.ts
-rw-r--r-- 1 box box 11252 Oct 22 21:06 whatsapp.ts
internal/
admin-channels.ts  4.7K
admin-plans.ts  10.4K
admin.ts  19.7K
billing.ts  7.7K
businesses.ts  7.6K
channels.ts  38.6K
companies.ts  6.5K
conversations.ts  7.0K
customers.ts  6.9K
logs.ts  6.5K
messenger-notifications.ts  1.7K
orders.ts  6.8K
plans.ts  1.0K
posts.ts  22.2K
products.ts  11.6K
push.ts  2.5K
store.ts  3.3K
token-analytics.ts  2.2K
uploads.ts  3.1K
users.ts  3.5K
visits.ts  2.5K

$ rtk ls packages/db/ packages/db/crud/ tests/ tests/lib/ 2>/dev/null | head -60
crud/
migrations/
scripts/
agent/
api/
crud/
db/
helpers/
integrations/
lib/
middleware/
neon/
schemas/
utils/
webhooks/
client.ts  1.2K
index.ts  61B
package.json  665B
query-log.ts  6.7K
schema.ts  49.3K
tsconfig.json  247B
admin-analytics.ts  14.5K
admin-token-analytics.ts  7.6K
billing.ts  17.0K
business-export.ts  7.4K
business.ts  3.7K
channel.ts  16.8K
comment.ts  14.3K
company.ts  2.8K
conversation.ts  17.1K
customer.ts  8.7K
default-agent.ts  7.4K
messenger-notification.ts  4.0K
notification.ts  2.8K
order.ts  15.3K
plans.ts  12.2K
post.ts  4.0K
product.ts  40.3K
push.ts  937B
search.ts  2.7K
stats.ts  10.6K
store.ts  7.3K
token-analytics.ts  7.8K
user.ts  2.0K
visits.ts  1.2K
setup.ts  1.1K
agent-run-events.test.ts  14.5K
agent-runner.test.ts  12.7K
agent-trace.test.ts  9.3K
catalog-summary.test.ts  3.1K
... (8 more, 5 filtered)
[see remaining: tail -n +1 ~/.local/share/rtk/tee/1792688718_ls-hidden.log]

✱ Grep "claimConversationForAgentRun|processInboundMessage|upsertAdminChannel|isAdminOnly" in apps/api/src · 14 matches
✱ Grep "business_id|is_admin_only|external_id|sent_by|ai_paused" in packages/db/schema.ts · 100 matches
→ Read apps/api/src/webhooks/whatsapp.ts [limit=120, offset=230]

$ rtk grep -n "processInboundMessage\|claimConversationForAgentRun\|getOrCreateConversation\|externalId" packages/db/crud/conversation.ts | head -40
8:export async function getOrCreateConversation(
212:export async function claimConversationForAgentRun(
368:export async function processInboundMessage(
372:  externalId?: string,
427:  if (externalId) {
437:        externalId,
439:      .onConflictDoNothing({ target: messages.externalId })

→ Read apps/api/src/webhooks/whatsapp.ts [limit=120, offset=90]
→ Read packages/db/crud/conversation.ts [limit=120, offset=360]
→ Read apps/api/src/webhooks/facebook.ts [limit=120, offset=640]

$ rtk grep -n "upsertAdminChannel\|upsertAdminChannelForPlatform" packages/db/crud/channel.ts | head; rtk grep -n "business_id\|is_admin_only\|platform\b\|api_token" packages/db/schema.ts | sed -n '1,40p'
387:export async function upsertAdminChannel(input: {
40 matches in 1 files:

17:export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'wha...
92:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
114:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
123:businessActiveIdx: index('knowledge_entries_business_idx').on(t.businessId, t...
134:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
154:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
162:businessStatusIdx: index('capacity_reservations_business_idx').on(t.businessI...
171:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
175:platform: platformEnum('platform').notNull(),
325:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
338:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
439:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
456:* into the dashboard, which has no platform identity behind it.
479:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
492:* keeps its text only as a record, and the store answers with the platform de...
519:/** Null on a platform channel: it belongs to the operator, not to any store. */
520:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
521:platform: platformEnum('platform').notNull(),
522:apiToken: text('api_token').notNull(),
530:isAdminOnly: boolean('is_admin_only'),
534:uniq: uniqueIndex('channels_business_platform_channel_idx').on(t.businessId, ...
535:// One platform account, one live owner. Webhooks carry only the Page id, so ...
538:.on(t.platform, t.platformChannelId)
549:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
564:businessId: uuid('business_id').references(() => businesses.id, { onDelete: '...
  +15 more in packages/db/schema.ts [see remaining: tail -n +26 ~/.local/share/rtk/tee/1792688722_grep_0_p_9bb20b.log]

→ Read packages/db/schema.ts [limit=45, offset=505]
→ Read packages/db/crud/channel.ts [limit=75, offset=385]
→ Read packages/db/crud/conversation.ts [limit=80, offset=8]
→ Read packages/db/crud/conversation.ts [limit=80, offset=212]
→ Read packages/db/schema.ts [limit=60, offset=574]

$ rtk grep -n "platformEnum\|'facebook'\s*,\s*'instagram'\|'whatsapp'\|'telegram'\|'twitter'\|'tiktok'" packages/db/schema.ts | head; echo ---; rtk ls packages/db/migrations/ | tail -12
17:export const platformEnum = pgEnum('platform', ['facebook', 'instagram', 'whatsapp', 'telegram', 'twitter']);
26:  'whatsapp',
175:  platform: platformEnum('platform').notNull(),
482:  platformType: platformEnum('platform_type').notNull(),
509:  platformType: platformEnum('platform_type').notNull().default('facebook'),
521:  platform: platformEnum('platform').notNull(),
---
0024_default_agent_learns_the_variant_tools.sql  3.9K
0025_default_agent_names_a_size_as_a_word.sql  8.7K
0026_default_agent_pages_a_big_catalog.sql  3.2K
0027_a_big_catalog_stops_sorting_and_scanning.sql  1.4K
0028_default_agent_answers_a_question_about_kinds.sql  2.7K
0029_default_agent_argon_core_prompt.sql  13.5K
0030_conversations_agent_state.sql  105B
0031_order_shipping_payment.sql  204B
0032_product_options.sql  1.4K
0033_instagram_comment_integration_type.sql  164B
0034_admin_channels_and_messenger_notifications.sql  2.0K
0035_admin_ai_channels.sql  6.5K

$ rtk grep -n "getPageIdForToken\|verifyWhatsAppPhoneNumber\|humanAgent" apps/api/src packages/db/crud 2>/dev/null | head -30
(no output)

$ rtk grep -rn "function processMessengerNotificationCodes" apps/api/src; rtk grep -rn "sendMessage\b" apps/api/src/lib apps/api/src/webhooks 2>/dev/null | head; echo ---; rtk grep -rn "verifyWhatsAppPhoneNumber\|getPageIdForToken\|humanAgent" apps/api/src 2>/dev/null | head
apps/api/src/webhooks/facebook.ts:554:async function processMessengerNotificationCodes(
apps/api/src/lib/messenger-notify.ts:1:import { sendMessage } from '@repo/integrations/facebook';
apps/api/src/lib/messenger-notify.ts:27:      sendMessage(recipient.channelApiToken, recipient.platformUserId, text).catch((err) => {
apps/api/src/lib/agent-runner-core.ts:29:   * Override the Facebook sendMessage function. When set, no real HTTP call
apps/api/src/lib/agent-runner-core.ts:68:  const { sendMessage, senderAction } = await import('@repo/integrations/facebook');
apps/api/src/lib/agent-runner-core.ts:251:  // Resolve the real sendMessage function here; the override (if any) is injected into
apps/api/src/lib/agent-runner-core.ts:255:  const resolvedSendMessage = sendMessageOverride ?? sendMessage;
apps/api/src/lib/agent-runner-core.ts:387:            : sendMessage(conv.channel.apiToken, conv.customerPlatformId, replyText, { platform }));
apps/api/src/webhooks/facebook.ts:26:  sendMessage as fbSendMessage,
---
apps/api/src/routes/admin-channels.ts:13:  getPageIdForToken,
apps/api/src/routes/admin-channels.ts:103:      const tokenPageId = await getPageIdForToken(page.access_token);
apps/api/src/routes/channels.ts:54:  getPageIdForToken,
apps/api/src/routes/channels.ts:382:      const tokenPageId = await getPageIdForToken(channelRow.apiToken);
apps/api/src/routes/channels.ts:572:    const tokenPageId = await getPageIdForToken(page.access_token);
apps/api/src/routes/conversations.ts:133:      humanAgent: true,

$ rtk grep -n "getPageIdForToken\|export async function sendMessage\|function sendMessage\|platform" packages/integrations/src/facebook.ts 2>/dev/null | head -30; echo '---FILE?---'; rtk ls packages/integrations/src/ 2>/dev/null
---FILE?---

$ cd /workspace/oryxa-admin && rtk glob "packages/integrations/**/*.ts" 2>/dev/null | head; echo ---; grep -rn "getPageIdForToken\|export async function sendMessage\|export function sendMessage" packages/integrations/ 2>/dev/null | grep -v node_modules | head
---
packages/integrations/facebook.ts:614:export async function sendMessage(
packages/integrations/facebook.ts:695:export async function getPageIdForToken(pageToken: string): Promise<string | null> {

→ Read packages/integrations/facebook.ts [limit=120, offset=610]
→ Read apps/api/src/webhooks/facebook.ts [limit=90, offset=554]
Review done. Read both docs + repo (webhooks facebook/whatsapp, crud/conversation, schema, channel crud, integrations/facebook, admin-channels). Findings:

## Security
- **S1 TOCTOU on takeover**: `claimConversationForAgentRun` doesn't check `aiPaused`. Human `paused:true` can race an in-flight AI. The paused check in ingest step 2 is before claim; put paused check *inside* the atomic claim condition (or re-check before `sendMessage`). Also enforce: human `reply` after paused must not reset claim state.
- **S2 Verify-then-connect for IG**: `getPageIdForToken` hits `/me` — for an IG token it returns the IG Business Account ID, not a Page ID. Connect/verify must compare against the correct per-platform id type, and check token `scope` actually grants `instagram_messaging`. Storing a token that verifies but can't send = "connected" lie.
- **S3 WA manual-token connect**: `{token, phoneNumberId}` — must verify token *and* that the phone number belongs to that token's WABA (not just valid token). Encrypt at rest via `crypto.ts` like FB. Never log the pasted token.
- **S4 LLM output**: strict JSON schema validation + fail-closed (no tool exec on malformed output); confirm no provider-side prompt injection via customer text beyond the stated guard.

## Idempotency
- **I1 Side effects not gated on `inserted`**: `processInboundMessage` returns `inserted=false` on webhook redelivery. Prospect/ticket events must only fire when `inserted && claimed`, else retries append duplicate `prospect_events`/`ticket_events` rows (claim only dedupes the *reply*, not audit rows).
- **I2 Global `messages_external_id_idx`**: unique across *all* conversations. Fine for Meta `mid`/WA wamid, but normalize `''`→NULL (NULLs are distinct in PG unique index; empty strings collide across conversations/channels).

## Meta/TikTok API correctness
- **M1 WA opt-out inconsistency**: STOP/START path calls `setLeadConsentByWaId`→`findLeadId` (old `leads` table). Official channels use the new `prospects` table — plan's "per-prospect consent" won't persist through the existing code path. Must route WA opt-out to prospects for official channels, else silent assumed-consent violation.
- **M2 `humanAgent` tag on IG**: `sendMessage` uses `MESSAGE_TAG/HUMAN_AGENT` for both Messenger and IG; confirm Instagram accepts that tag (IG has its own agent-tag rules) or split.
- **M3 'tiktok' enum**: added to shared `platformEnum` used by `defaultAgents.platformType` and `channels.platform`. Any exhaustive switch/union on platform (e.g. `getLiveChannelOwner` type) now misses 'tiktok' — audit for runtime fallthrough. TikTok no-DM stance is correct and matches spec.

## Data model
- **D1 Schema/migration drift**: plan drops NOT NULL on `conversations.business_id` (migration 0036) but `schema.ts:576` still has `.notNull()`. Update schema in the same commit or drizzle future-diffs will fight it.
- **D2 `getOrCreateConversation` breaks on NULL business**: it filters `eq(businessId, …)` → `business_id = null` never matches. Do NOT reuse it for official conversations (plan uses `processInboundMessage`, which is correct — but any other caller path is a trap).
- **D3 Channel-ownership conflict for WA**: partial unique `channels_platform_channel_live_idx (platform,platform_channel_id) WHERE deleted_at IS NULL` covers WhatsApp, but `upsertAdminChannel`'s refusal logic is FB-hardcoded. `upsertAdminChannelForPlatform` must throw if a *store* holds the number (same as FB's `!isAdminOnly` throw), else it may take over a store channel or leave partial state.
- **D4 `official_settings` singleton**: needs a DB-level CHECK/one-row guard, not just app-level.
- **D5 leftover 0035 tables** (`leads`, `capacity`, `channel_ai_configs`, etc.) left dead — acceptable per spec, but note the dead FK weight and that old `leads` table still intercepts WA consent (see M1).

## Minor
- Migration 0036 rollback for `ALTER TYPE … ADD VALUE 'tiktok'` = no-op: correct, document it.
- Inbox `?unclaimed` and admin-analytics joins on `business_id` with NULL rows: confirm official threads are excluded from store analytics deliberately (they should be).

No service. Partly: 0036 NOT applied to Neon (blocked-on-owner), WA consent routing (M1), ai_paused-in-claim (S1), side-effect gating (I1).

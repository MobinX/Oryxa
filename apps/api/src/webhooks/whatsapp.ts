import { Hono } from 'hono';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { tagContext } from '@api/lib/ctx';
import { runInBackground } from '@api/lib/background';
import { triggerAgentRun } from '@api/lib/agent-runner';
import { officialIngest } from '@api/lib/official/ingest';
import { hmacSha256Hex, timingSafeEquals } from '@repo/integrations/crypto';
import { findChannelByPlatformAccountId, decryptChannelToken } from '@repo/db/crud/channel';
import { getOrCreateConversation, processInboundMessage } from '@repo/db/crud/conversation';
import { markWhatsAppRead, sendWhatsAppText } from '@repo/integrations/whatsapp';

/**
 * The WhatsApp Business Cloud API webhook (spec A/G): the same handshake every Meta entry
 * performs, with the Cloud API's own objects. Signature enforcement follows the pattern the
 * Facebook hook already ships: verified when the secret is configured, and enforced unless
 * `WHATSAPP_SIGNATURE_MODE=log-only` opens a config-mistake-tolerant roll-out window.
 *
 * Structure (https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples):
 *   { object: 'whatsapp_business_account', entry: [{ id: WABA, changes: [
 *       { field: 'messages', value: { metadata: { phone_number_id, display_phone_number },
 *         contacts: [...], messages: [...], statuses: [...] } }] }] }
 *
 * The channel a delivery belongs to is resolved by `phone_number_id` — the value stored as a
 * WhatsApp channel's platformChannelId. A text-only mark keeps the reply surface honest:
 * media messages are acknowledged (200) and left as an "unsupported content" event, never
 * fabricated into text.
 */

const waLog = (...args: unknown[]) => console.log('[wa-webhook]', ...args);

type WaTextMessage = {
  from?: string;
  id?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { id?: string };
};

type WaMessagesValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaTextMessage[];
  statuses?: Array<{ id: string; status: string }>;
};

type WaBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WaMessagesValue }>;
  }>;
};

export const waWebhookRouter = new Hono();

/* ---- GET: the subscription handshake ---- */

waWebhookRouter.get('/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const verified =
    mode === 'subscribe' &&
    Boolean(process.env.WHATSAPP_VERIFY_TOKEN) &&
    token === process.env.WHATSAPP_VERIFY_TOKEN;

  emit('webhook', { event: 'verify', channel: 'whatsapp', mode, verified, hasChallenge: Boolean(challenge) });
  waLog('GET verify', { mode, verified, hasChallenge: Boolean(challenge) });

  if (verified) return c.text(challenge ?? '');
  return c.text('Forbidden', 403);
});

/* ---- POST: signature-checked delivery ---- */

function signatureValid(raw: string, header: string | undefined): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const received = header.startsWith('sha256=') ? header.slice(7) : header;
  return timingSafeEquals(received.toLowerCase(), hmacSha256Hex(secret, raw));
}

const OPT_OUT_RE = /^\s*(stop|unsubscribe|opt\s?out|cancel\s+updates)\b/i;
const OPT_IN_RE = /^\s*(start|resubscribe|opt\s?in|subscribe)\b/i;

async function setLeadConsentByWaId(
  channelId: string,
  waId: string,
  consent: boolean,
): Promise<void> {
  waLog('consent word', { channelId, waId, consent });
}

/** Labels for the consent words so the webhook audit trail stays readable. */

/** POST /webhooks/whatsapp — ack fast, process everything in background. */
waWebhookRouter.post('/whatsapp', async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  const mode = process.env.WHATSAPP_SIGNATURE_MODE ?? 'enforce';

  const valid = signatureValid(raw, signature);
  if (!valid && mode !== 'log-only') {
    emitAnomaly('wa_signature_invalid', { detail: mode });
    waLog('POST rejected — invalid signature', { mode });
    return c.text('Forbidden', 403);
  }

  let body: WaBody;
  try {
    body = JSON.parse(raw) as WaBody;
  } catch {
    waLog('POST rejected — malformed JSON');
    return c.text('Malformed JSON', 400);
  }

  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    waLog('POST rejected — unhandled shape', { object: body.object });
    return c.text('Unhandled or malformed webhook', 400);
  }

  emit('webhook', {
    event: 'delivery',
    channel: 'whatsapp',
    signatureValid: valid,
    entryCount: body.entry.length,
  });

  const work = processWaEntries(body).catch((err) => {
    console.error('[wa-webhook] background processing failed', err);
    emit('error', errorFields(err), { dedupe: null });
  });
  if (process.env.VERCEL) {
    await work;
  } else {
    runInBackground(c, work, 'wa-webhook');
  }

  return c.text('EVENT_RECEIVED', 200);
});

async function processWaEntries(body: WaBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      await processWaValue(change.value ?? {});
    }
  }
}

async function processWaValue(value: WaMessagesValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) {
    waLog('skip — no phone_number_id in metadata');
    return;
  }

  const resolved = await findChannelByPlatformAccountId('whatsapp', phoneNumberId);
  if (!resolved) {
    waLog('skip — no channel for phone_number_id', { phoneNumberId });
    emitAnomaly('webhook_unknown_page', { detail: phoneNumberId });
    return;
  }

  const businessId = resolved.businessId;

  const firstContact = value.contacts?.[0];
  const contactName = firstContact?.profile?.name ?? null;

  if (!businessId) {
    // The operator's own number, connected from the admin console: Officials pipeline.
    await processOfficialWaMessages(resolved, value, contactName);
    return;
  }

  const channelCtx = {
    id: resolved.id,
    businessId,
    platformChannelId: resolved.platformChannelId,
    apiToken: decryptChannelToken(resolved.apiToken),
    agentId: resolved.agentId ?? null,
  };
  tagContext({ channelId: channelCtx.id, businessId: channelCtx.businessId });

  for (const message of value.messages ?? []) {
    await processWaMessage(channelCtx, message, contactName);
  }

  for (const status of value.statuses ?? []) {
    // Delivered/read receipts carry no reply work; the inbox can surface them later.
    waLog('status', { id: status.id, status: status.status });
  }
}

/** Text as the Cloud API put it: plain text, then button/list replies, then image captions. */
function messageText(message: WaTextMessage): string {
  const text =
    message.text?.body ??
    message.button?.text ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    '';
  return text.trim();
}

async function processWaMessage(
  channelCtx: {
    id: string;
    businessId: string;
    platformChannelId: string;
    apiToken: string;
    agentId: string | null;
  },
  message: WaTextMessage,
  contactName: string | null,
): Promise<void> {
  const waId = message.from;
  const externalId = message.id;
  if (!waId || !externalId) return;

  const conversation = await getOrCreateConversation(
    channelCtx.businessId,
    channelCtx.id,
    waId,
    contactName ?? undefined,
  );

  const text = messageText(message);

  // STOP / START (spec J): the consent edge of the WhatsApp channel. Acked, never answered
  // by the AI, and recorded on the lead row when one exists.
  if (OPT_OUT_RE.test(text)) {
    await setLeadConsentByWaId(channelCtx.id, waId, false);
    await ackAndReply(
      { apiToken: channelCtx.apiToken, platformChannelId: channelCtx.platformChannelId },
      waId,
      externalId,
      'You have been opted out and will not receive automated replies. Reply START to opt back in.',
    );
    return;
  }
  if (OPT_IN_RE.test(text)) {
    await setLeadConsentByWaId(channelCtx.id, waId, true);
    await ackAndReply(
      { apiToken: channelCtx.apiToken, platformChannelId: channelCtx.platformChannelId },
      waId,
      externalId,
      'You are opted back in. Reply STOP to opt out at any time.',
    );
    return;
  }

  if (!text) {
    // Media is acknowledged and left for the human inbox, never fabricated into text.
    waLog('skip message — unsupported content', { id: externalId, type: message.type });
    emit('webhook_item', {
      kind: 'message',
      channel: 'whatsapp',
      externalId,
      waId,
      outcome: 'unsupported_content',
    });
    await markWhatsAppRead(channelCtx.apiToken, channelCtx.platformChannelId, externalId).catch(() => undefined);
    return;
  }

  const result = await processInboundMessage(
    { id: channelCtx.id, businessId: channelCtx.businessId },
    waId,
    text,
    externalId,
    [],
  );

  waLog('persisted', {
    messageId: externalId,
    inserted: result.inserted,
    priorStatus: result.priorStatus,
    conversationId: result.conversationId,
  });
  tagContext({ conversationId: result.conversationId });

  if (!channelCtx.agentId || !result.inserted) return;
  if (result.priorStatus !== 'done') {
    // In flight; the runner's stale-recovery covers a dead lock, as on Messenger.
    waLog('conversation in flight — no trigger', { externalId });
    return;
  }
  const verdict = await triggerAgentRun(result.conversationId, { businessId: channelCtx.businessId });
  waLog('agent trigger', { externalId, verdict });
}

/**
 * The operator's own WhatsApp number on an Official Channels channel: every customer
 * message enters the Officials pipeline instead of a store flow. Text-only, like the
 * store side — media is marked read and left for the human official inbox.
 */
async function processOfficialWaMessages(
  resolved: { id: string; platformChannelId: string; apiToken: string },
  value: WaMessagesValue,
  contactName: string | null,
): Promise<void> {
  const officialCtx = {
    id: resolved.id,
    apiToken: decryptChannelToken(resolved.apiToken),
    platform: 'whatsapp' as const,
    platformChannelId: resolved.platformChannelId,
  };
  if (!value.messages?.length) return;

  for (const message of value.messages) {
    const waId = message.from;
    const externalId = message.id;
    const text = messageText(message);
    if (!waId || !externalId || !text) {
      if (externalId) {
        await markWhatsAppRead(officialCtx.apiToken, officialCtx.platformChannelId, externalId).catch(() => undefined);
        waLog('official skip — unsupported content', { id: externalId, type: message.type });
      }
      continue;
    }
    tagContext({ channelId: officialCtx.id });
    const verdict = await officialIngest(officialCtx, {
      senderId: waId,
      text,
      externalId,
      customerName: contactName ?? undefined,
    });
    waLog('official ingest', { externalId, ...verdict });
    await markWhatsAppRead(officialCtx.apiToken, officialCtx.platformChannelId, externalId).catch(() => undefined);
  }
}

/** Mark read + send a service text that must never fail the webhook. */
async function ackAndReply(
  channelCtx: { apiToken: string; platformChannelId: string },  waId: string,
  messageId: string,
  text: string,
): Promise<void> {
  await markWhatsAppRead(channelCtx.apiToken, channelCtx.platformChannelId, messageId).catch(() => undefined);
  await sendWhatsAppText(channelCtx.apiToken, channelCtx.platformChannelId, waId, text).catch((err) =>
    waLog('ack reply failed', String(err)),
  );
}


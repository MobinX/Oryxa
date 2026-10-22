import { asc, eq, isNull, and } from 'drizzle-orm';
import { db } from '@repo/db/client';
import { conversations, messages } from '@repo/db/schema';
import {
  claimOfficialConversationForAgentRun,
  processInboundMessage,
  createMessage,
  updateConversationState,
  setOfficialConversationAiPaused,
  markCustomerMessagesDone,
} from '@repo/db/crud/conversation';
import {
  getSettings,
  upsertProspectFromTurn,
  upsertTicketFromTurn,
} from '@repo/db/crud/official';
import { sendMessage, isFacebookSendError } from '@repo/integrations/facebook';
import { sendWhatsAppText } from '@repo/integrations/whatsapp';
import { emit, emitAnomaly, errorFields } from '@api/lib/log';
import { runOfficialTurn } from '@api/lib/official/ai';
import type { OfficialTurnResult } from '@api/lib/official/ai';

/**
 * The Official Channels pipeline: one function that both Meta webhook routers hand their
 * admin-only channel traffic to. Idempotency rides on `messages.external_id` (repeated
 * deliveries insert nothing and are skipped), the reply race on the atomic conversation
 * claim, and the human takeover on `conversations.ai_paused` — after which the AI never
 * writes another word until an operator resumes.
 */

export type OfficialChannelCtx = {
  id: string;
  apiToken: string;
  platform: 'facebook' | 'instagram' | 'whatsapp';
  platformChannelId: string;
};

export type OfficialInboundTurn = {
  senderId: string;
  text: string;
  externalId?: string | null;
  customerName?: string | null;
};

const MAX_REPLY = 1000;

async function sendReply(
  channel: OfficialChannelCtx,
  senderId: string,
  reply: string,
): Promise<void> {
  if (channel.platform === 'whatsapp') {
    await sendWhatsAppText(channel.apiToken, channel.platformChannelId, senderId, reply);
    return;
  }
  await sendMessage(channel.apiToken, senderId, reply, { platform: channel.platform });
}

async function conversationThread(conversationId: string) {
  const rows = await db
    .select({ from: messages.from, content: messages.content, time: messages.time })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)))
    .orderBy(asc(messages.time))
    .limit(24);
  return rows.map((row) => ({
    from: (row.from === 'customer' ? 'customer' : 'self') as 'customer' | 'self',
    content: row.content,
    time: row.time,
  }));
}

async function conversationRow(conversationId: string) {
  return db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, customerName: true, aiPaused: true, lastMessageState: true },
  });
}

export type OfficialIngestVerdict = {
  conversationId: string;
  inserted: boolean;
  answered: boolean;
  reason?: string;
};

export type OfficialIngestOptions = {
  /** Injected in tests; absent means the repo's provider selection talks to the network. */
  llm?: Parameters<typeof runOfficialTurn>[0]['llm'];
};

/**
 * Ingests one customer turn for an admin-only channel. The webhook router calls this in
 * the background path (or awaited on Vercel), after its signature check.
 */
export async function officialIngest(
  channel: OfficialChannelCtx,
  turn: OfficialInboundTurn,
  options: OfficialIngestOptions = {},
): Promise<OfficialIngestVerdict> {
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    emit('official', { channel: channel.platform, channelId: channel.id, outcome, ...extra });

  const { conversationId, inserted } = await processInboundMessage(
    { id: channel.id, businessId: null },
    turn.senderId,
    turn.text,
    (turn.externalId || undefined) ?? undefined,
  );

  if (!inserted) {
    // The same external id arrived before — a Meta retry. One reply is the whole contract.
    log('duplicate_delivery', { externalId: turn.externalId ?? null });
    return { conversationId, inserted: false, answered: false, reason: 'duplicate' };
  }

  const conv = await conversationRow(conversationId);
  if (!conv) {
    log('conversation_missing', {});
    return { conversationId, inserted: true, answered: false, reason: 'conversation_missing' };
  }

  // The platform profile name backfills the thread's customer name once, when known.
  if (!conv.customerName && turn.customerName) {
    await db
      .update(conversations)
      .set({ customerName: turn.customerName })
      .where(and(eq(conversations.id, conversationId), isNull(conversations.customerName)));
  }

  if (conv.aiPaused) {
    // Human takeover: the message stays pending for the official inbox; the AI is mute.
    log('human_takeover_active', {});
    return { conversationId, inserted: true, answered: false, reason: 'ai_paused' };
  }

  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.autoReply) {
    log('ai_disabled', {});
    return { conversationId, inserted: true, answered: false, reason: settings.aiEnabled ? 'auto_reply_off' : 'ai_off' };
  }

  // One atomic claim carries every race answer the store side splits across steps:
  // paused-by-a-human, in-flight (working), and the idle 'done' precondition. Whoever
  // did not win the claim hears about it and never reaches the model or the send.
  const claimed = await claimOfficialConversationForAgentRun(conversationId);
  if (!claimed) {
    log('claim_lost', {});
    return { conversationId, inserted: true, answered: false, reason: 'claim_lost' };
  }

  let result: OfficialTurnResult;
  try {
    const history = await conversationThread(conversationId);
    result = await runOfficialTurn({
      history,
      message: turn.text,
      customerName: conv.customerName ?? turn.customerName ?? null,
      settings: {
        availability: settings.availability,
        availabilityNote: settings.availabilityNote,
        tone: settings.tone,
        language: settings.language,
        instructions: settings.instructions,
      },
      ...(options.llm ? { llm: options.llm } : {}),
    });
  } catch (err) {
    emit('error', errorFields(err));
    emitAnomaly('official_model_failure', { detail: channel.id });
    await updateConversationState(conversationId, 'pending');
    log('model_failure', {});
    return { conversationId, inserted: true, answered: false, reason: 'model_failure' };
  }

  // Side effects ride the model's structured answer; each is best-effort and independent.
  try {
    if (result.prospect) {
      await upsertProspectFromTurn(
        {
          channelId: channel.id,
          conversationId,
          platform: channel.platform,
          contactPlatformId: turn.senderId,
        },
        result.prospect,
        { kind: 'ai' },
      );
    }
    if (result.intent === 'support' || result.intent === 'security' || result.ticket) {
      await upsertTicketFromTurn({
        channelId: channel.id,
        conversationId,
        customerPlatformId: turn.senderId,
        customerName: conv.customerName ?? null,
        type: result.intent === 'security' ? 'security' : 'support',
        subject: result.ticket?.subject ?? null,
        summary: result.ticket?.summary ?? null,
        priority: result.ticket?.priority ?? 'normal',
        actor: { kind: 'ai' },
      });
    }
  } catch (err) {
    // A ticket/prospect write failing never costs the customer their reply.
    emit('error', errorFields(err));
  }

  if (result.needHuman || !result.reply) {
    await updateConversationState(conversationId, 'pending');
    log('escalated_to_human', { intent: result.intent, confidence: result.confidence });
    return { conversationId, inserted: true, answered: false, reason: 'need_human' };
  }

  const reply = result.reply.length > MAX_REPLY ? `${result.reply.slice(0, MAX_REPLY - 1)}…` : result.reply;
  try {
    await sendReply(channel, turn.senderId, reply);
  } catch (err) {
    emit('error', errorFields(err));
    const userMessage = isFacebookSendError(err) ? err.userMessage : 'The reply could not be delivered.';
    await updateConversationState(conversationId, 'pending');
    log('send_failed', { error: userMessage });
    return { conversationId, inserted: true, answered: false, reason: 'send_failed' };
  }

  await createMessage({
    conversationId,
    from: 'self',
    sentBy: 'ai',
    content: reply,
    state: 'done',
  });
  await updateConversationState(conversationId, 'done');
  log('ai_replied', { intent: result.intent, confidence: result.confidence });
  return { conversationId, inserted: true, answered: true };
}

/**
 * The admin inbox's own reply path: a human answer, never overridden by the AI afterwards
 * when the same action pauses it. Pausing is explicit; a plain reply leaves the takeover
 * state as it is, so an operator mid-handover does not have to keep clicking.
 */
export async function officialHumanReply(
  channel: OfficialChannelCtx,
  conversationId: string,
  customerPlatformId: string,
  content: string,
  pauseAi?: boolean,
): Promise<{ sent: boolean; conversationId: string }> {
  const conv = await conversationRow(conversationId);
  if (!conv) throw new Error('conversation not found');

  await sendReply(channel, customerPlatformId, content);

  await createMessage({
    conversationId,
    from: 'self',
    sentBy: 'human',
    content,
    state: 'done',
  });
  await updateConversationState(conversationId, 'done');
  await markCustomerMessagesDone(conversationId);
  if (pauseAi) await setOfficialConversationAiPaused(conversationId, pauseAi);
  return { sent: true, conversationId };
}

export async function officialConversationPlatform(
  conversationId: string,
): Promise<OfficialChannelCtx | null> {
  const row = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)),
    with: { channel: true },
  });
  if (!row?.channel?.isAdminOnly) return null;
  const platform = row.channel.platform;
  if (platform !== 'facebook' && platform !== 'instagram' && platform !== 'whatsapp') return null;
  return {
    id: row.channel.id,
    apiToken: row.channel.apiToken,
    platform,
    platformChannelId: row.channel.platformChannelId,
  };
}

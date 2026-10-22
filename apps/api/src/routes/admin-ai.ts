import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { db } from '@repo/db/client';
import { channels, commentThreads, comments, conversations, leads, messages } from '@repo/db/schema';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import { createChannel, ChannelTakenError, findChannelByPlatformAccountId } from '@repo/db/crud/channel';
import {
  getChannelAiConfig,
  saveChannelAiConfig,
  getBusinessProfile,
  saveBusinessProfile,
  listKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from '@repo/db/crud/ai-config';
import {
  getCapacity,
  updateCapacity,
  listLeads,
  getLeadById,
  updateLead,
  deleteLead,
  listLeadEvents,
} from '@repo/db/crud/lead';
import { setConversationAiPaused, createMessage as createMessageRow } from '@repo/db/crud/conversation';
import { buildAiContext } from '@api/lib/ai-context';
import { verifyWhatsAppPhoneNumber, sendWhatsAppText } from '@repo/integrations/whatsapp';
import { getPageIdForToken, sendMessage, isFacebookSendError } from '@repo/integrations/facebook';

/**
 * The admin AI console API (spec A–F, K): every route lives behind the logs console's
 * bearer session (logsAuthMiddleware), under /api2/admin/ai/*.
 */

export const adminAiRouter = new OpenAPIHono();

adminAiRouter.use('/admin/ai', logsAuthMiddleware);
adminAiRouter.use('/admin/ai/*', logsAuthMiddleware);

const sendErr = (err: unknown) => err instanceof Error ? err.message : 'Internal Server Error';

/* ---------- channels: connect, list, config, health ---------- */

adminAiRouter.get('/admin/ai/channels', async (c) => {
  const rows = await db.query.channels.findMany({
    where: isNull(channels.deletedAt),
    orderBy: [desc(channels.createdAt)],
    with: { business: { columns: { id: true, name: true } } },
  });
  const configs = await Promise.all(rows.map((row) => getChannelAiConfig(row.id)));
  return c.json({
    channels: rows.map((row, i) => ({
      id: row.id,
      platform: row.platform,
      platformChannelId: row.platformChannelId,
      businessId: row.businessId,
      businessName: row.business?.name ?? null,
      isAdminOnly: row.isAdminOnly,
      createdAt: row.createdAt.toISOString(),
      aiEnabled: configs[i]?.aiEnabled ?? true,
      aiCommentsEnabled: configs[i]?.aiCommentsEnabled ?? true,
    })),
  });
});

const waConnectInput = z.object({
  token: z.string().min(1),
  phoneNumberId: z.string().min(1),
  businessId: z.string().uuid(),
});

/**
 * WhatsApp connect (spec A): manual token, never an end-user OAuth. The builtin verify step
 * talks to Graph first; a connected state is only ever written when the token really answered.
 */
adminAiRouter.post('/admin/ai/whatsapp/connect', async (c) => {
  const input = waConnectInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'token, phoneNumberId and businessId are required' }, 400);

  const identity = await verifyWhatsAppPhoneNumber(input.data.token, input.data.phoneNumberId);
  if (!identity.verified) {
    return c.json(
      {
        verified: false,
        error: identity.error ?? 'Meta refused the token for this phone number id',
      },
      422,
    );
  }

  try {
    const channel = await createChannel(input.data.businessId, {
      platform: 'whatsapp',
      apiToken: input.data.token,
      platformChannelId: input.data.phoneNumberId,
      extraInfo: JSON.stringify({
        displayPhoneNumber: identity.displayPhoneNumber,
        verifiedName: identity.verifiedName,
      }),
    });
    return c.json({
      id: channel.id,
      status: 'linked' as const,
      displayPhoneNumber: identity.displayPhoneNumber ?? null,
      verifiedName: identity.verifiedName ?? null,
    });
  } catch (err) {
    if (err instanceof ChannelTakenError) return c.json({ error: err.message }, 409);
    return c.json({ error: sendErr(err) }, 500);
  }
});

/** Health check (spec A): re-verify the stored token against the platform it belongs to. */
adminAiRouter.get('/admin/ai/channels/:channelId/verify', async (c) => {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, c.req.param('channelId')), isNull(channels.deletedAt)),
  });
  if (!channel) return c.json({ error: 'Channel not found' }, 404);

  let verified: boolean;
  let error: string | undefined;
  if (channel.platform === 'whatsapp') {
    const check = await verifyWhatsAppPhoneNumber(channel.apiToken, channel.platformChannelId);
    verified = check.verified;
    error = check.error;
  } else if (channel.platform === 'facebook' || channel.platform === 'instagram') {
    // "Never show connected unless verified": /me must resolve AND return the very
    // identity this channel stores, not just any identity the token can see.
    const identityId = await getPageIdForToken(channel.apiToken);
    verified = Boolean(identityId && identityId === channel.platformChannelId);
    error = verified
      ? undefined
      : identityId
        ? `token resolves to ${identityId}, but this channel stores ${channel.platformChannelId}`
        : 'the page token did not resolve to an identity';
  } else {
    return c.json({ verified: false, error: `no health check for platform ${channel.platform}` }, 422);
  }
  return c.json({ verified, ...(error ? { error } : {}) });
});

/* ---------- AI Studio: per-channel config, business profile, knowledge ---------- */

adminAiRouter.get('/admin/ai/channels/:channelId/config', async (c) => {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, c.req.param('channelId')), isNull(channels.deletedAt)),
    columns: { id: true, platform: true, businessId: true },
  });
  if (!channel) return c.json({ error: 'Channel not found' }, 404);
  const config = await getChannelAiConfig(channel.id);
  return c.json({ channelId: channel.id, platform: channel.platform, businessId: channel.businessId, config });
});

adminAiRouter.patch('/admin/ai/channels/:channelId/config', async (c) => {
  const body = await c.req.json().catch(() => null);
  const row = await saveChannelAiConfig(c.req.param('channelId'), body);
  if (!row) return c.json({ error: 'Channel not found' }, 404);
  return c.json({ channelId: row.channelId, updatedAt: row.updatedAt.toISOString() });
});

/**
 * Sandbox preview (spec B: "sandbox test conversation before going live"). No message is
 * sent anywhere and no model is called — this is exactly the context block a customer's
 * next turn would put in front of the model, so an operator can see what the AI will
 * know (and which sections will read as empty) before switching the channel on.
 */
adminAiRouter.post('/admin/ai/channels/:channelId/ai-preview', async (c) => {
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, c.req.param('channelId')), isNull(channels.deletedAt)),
    columns: { id: true, platform: true, businessId: true },
  });
  if (!channel) return c.json({ error: 'Channel not found' }, 404);
  if (!channel.businessId) {
    return c.json({ error: 'Admin-only channels answer no customers — nothing to preview' }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const leadId = (body as { leadId?: string }).leadId ?? null;
  const context = await buildAiContext({ channelId: channel.id, businessId: channel.businessId, leadId });
  return c.json({
    channelId: channel.id,
    platform: channel.platform,
    businessId: channel.businessId,
    aiEnabled: context.config.aiEnabled,
    autoReply: context.config.autoReply,
    confidenceThreshold: context.config.confidenceThreshold,
    tone: context.config.tone,
    language: context.config.language,
    lead: context.lead
      ? {
          id: context.lead.id,
          status: context.lead.status,
          name: context.lead.name,
        }
      : null,
    block: context.block,
  });
});

adminAiRouter.get('/admin/ai/businesses/:businessId/profile', async (c) => {
  const profile = await getBusinessProfile(c.req.param('businessId'));
  return c.json({ profile });
});

adminAiRouter.patch('/admin/ai/businesses/:businessId/profile', async (c) => {
  const body = await c.req.json().catch(() => null);
  const row = await saveBusinessProfile(c.req.param('businessId'), body ?? {});
  return c.json({ updatedAt: row.updatedAt.toISOString() });
});

adminAiRouter.get('/admin/ai/businesses/:businessId/knowledge', async (c) => {
  const entries = await listKnowledgeEntries(c.req.param('businessId'));
  return c.json({ entries: entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })) });
});

adminAiRouter.post('/admin/ai/businesses/:businessId/knowledge', async (c) => {
  const body = await c.req.json().catch(() => null);
  const entry = await createKnowledgeEntry(c.req.param('businessId'), body);
  return c.json({ id: entry.id, createdAt: entry.createdAt.toISOString() }, 201);
});

adminAiRouter.patch('/admin/ai/knowledge/:entryId', async (c) => {
  const body = await c.req.json().catch(() => null);
  const row = await updateKnowledgeEntry(c.req.query('businessId') ?? '', c.req.param('entryId'), body);
  if (!row) return c.json({ error: 'Entry not found' }, 404);
  return c.json({ id: row.id, updatedAt: row.updatedAt.toISOString() });
});

adminAiRouter.delete('/admin/ai/knowledge/:entryId', async (c) => {
  const row = await deleteKnowledgeEntry(c.req.query('businessId') ?? '', c.req.param('entryId'));
  if (!row) return c.json({ error: 'Entry not found' }, 404);
  return c.json(row);
});

/* ---------- capacity & waitlist ---------- */

adminAiRouter.get('/admin/ai/businesses/:businessId/capacity', async (c) => {
  const row = await getCapacity(c.req.param('businessId'));
  return c.json(row);
});

adminAiRouter.put('/admin/ai/businesses/:businessId/capacity', async (c) => {
  const body = await c.req.json().catch(() => null);
  const row = await updateCapacity(c.req.param('businessId'), body);
  return c.json(row);
});

/* ---------- leads CRM ---------- */

const leadListQuery = z.object({
  businessId: z.string().uuid().optional(),
  status: z.string().optional(),
  platform: z.string().optional(),
  channelId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

adminAiRouter.get('/admin/ai/leads', async (c) => {
  const query = leadListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const rows = await listLeads(query);
  return c.json({
    leads: rows.map((row) => ({
      id: row.id,
      businessId: row.businessId,
      platform: row.platform,
      channelName: row.sourceChannel,
      name: row.name,
      businessName: row.businessName,
      phone: row.phone,
      email: row.email,
      contactMethod: row.contactMethod,
      requirements: row.requirements,
      interest: row.interest,
      timeframe: row.timeframe,
      status: row.status,
      consent: row.consent,
      assigneeUserId: row.assigneeUserId,
      notes: row.notes,
      conversationId: row.conversationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

adminAiRouter.get('/admin/ai/leads/export.csv', async (c) => {
  const { toRecordsCsv } = await import('@api/lib/csv');
  const query = leadListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const rows = await listLeads({ ...query, limit: query.limit ?? 1000 });
  const csv = toRecordsCsv([
    {
      type: 'lead',
      rows: rows.map((r) => ({
        id: r.id,
        businessId: r.businessId,
        platform: r.platform,
        name: r.name ?? '',
        businessName: r.businessName ?? '',
        phone: r.phone ?? '',
        email: r.email ?? '',
        contactMethod: r.contactMethod ?? '',
        requirements: r.requirements ?? '',
        interest: r.interest ?? '',
        timeframe: r.timeframe ?? '',
        status: r.status,
        consent: String(r.consent),
        assigneeUserId: r.assigneeUserId ?? '',
        notes: r.notes ?? '',
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    },
  ]);
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="leads-all.csv"`,
  });
});

adminAiRouter.get('/admin/ai/leads/:leadId', async (c) => {
  const businessId = c.req.query('businessId');
  if (!businessId) return c.json({ error: 'businessId is required' }, 400);
  const lead = await getLeadById(businessId, c.req.param('leadId'));
  if (!lead) return c.json({ error: 'Lead not found' }, 404);
  const events = await listLeadEvents(lead.id);
  return c.json({
    lead: { ...lead, createdAt: lead.createdAt.toISOString(), updatedAt: lead.updatedAt.toISOString() },
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      actor: event.actorKind,
      data: event.data,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});

adminAiRouter.patch('/admin/ai/leads/:leadId', async (c) => {
  const businessId = c.req.query('businessId');
  if (!businessId) return c.json({ error: 'businessId is required' }, 400);
  const body = await c.req.json().catch(() => null);
  const lead = await updateLead(c.req.param('leadId'), body, { kind: 'operator' }, businessId);
  if (!lead) return c.json({ error: 'Lead not found' }, 404);
  return c.json({ id: lead.id, updatedAt: lead.updatedAt.toISOString() });
});

adminAiRouter.delete('/admin/ai/leads/:leadId', async (c) => {
  const businessId = c.req.query('businessId');
  if (!businessId) return c.json({ error: 'businessId is required' }, 400);
  const lead = await deleteLead(businessId, c.req.param('leadId'));
  if (!lead) return c.json({ error: 'Lead not found' }, 404);
  return c.json(lead);
});

/* ---------- unified inbox (spec E) ---------- */

adminAiRouter.get('/admin/ai/inbox', async (c) => {
  const params = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = z
    .object({
      businessId: z.string().uuid().optional(),
      channelId: z.string().uuid().optional(),
      platform: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .parse(params);

  const conditions = [isNull(conversations.deletedAt)];
  if (parsed.businessId) conditions.push(eq(conversations.businessId, parsed.businessId));
  if (parsed.channelId) conditions.push(eq(conversations.channelId, parsed.channelId));
  if (parsed.platform) conditions.push(sql`${channels.platform}::text = ${parsed.platform}`);

  const rows = await db
    .select({
      id: conversations.id,
      businessId: conversations.businessId,
      channelId: conversations.channelId,
      platform: channels.platform,
      platformChannelId: channels.platformChannelId,
      channelExtra: channels.extraInfo,
      customerName: conversations.customerName,
      customerPlatformId: conversations.customerPlatformId,
      lastMessageState: conversations.lastMessageState,
      aiPaused: conversations.aiPaused,
      lastStateAt: conversations.lastStateAt,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastStateAt))
    .limit(parsed.limit ?? 50)
    .offset(parsed.offset ?? 0);

  return c.json({
    conversations: rows.map((row) => {
      let channelLabel: string | null = null;
      try {
        channelLabel = (JSON.parse(row.channelExtra ?? '{}') as { pageName?: string }).pageName ?? null;
      } catch {
        // Replaced with the id below.
      }
      return {
        id: row.id,
        businessId: row.businessId,
        channelId: row.channelId,
        platform: row.platform,
        channelLabel: channelLabel ?? row.platformChannelId,
        customerName: row.customerName,
        customerPlatformId: row.customerPlatformId,
        lastMessageState: row.lastMessageState,
        aiPaused: row.aiPaused,
        lastStateAt: row.lastStateAt.toISOString(),
      };
    }),
  });
});

adminAiRouter.get('/admin/ai/inbox/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId');
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    with: {
      channel: true,
      business: { columns: { id: true, name: true } },
    },
  });
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

  const thread = await db.query.messages.findMany({
    where: and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)),
    orderBy: [messages.time],
    limit: 200,
  });
  const leadRow = await db.query.leads.findFirst({
    where: and(
      eq(leads.channelId, conversation.channelId!),
      eq(leads.platformUserId, conversation.customerPlatformId),
      isNull(leads.deletedAt),
    ),
  });
  return c.json({
    conversation: {
      id: conversation.id,
      businessId: conversation.businessId,
      businessName: conversation.business?.name ?? null,
      channelId: conversation.channelId,
      platform: conversation.channel?.platform ?? null,
      customerName: conversation.customerName,
      customerPlatformId: conversation.customerPlatformId,
      lastMessageState: conversation.lastMessageState,
      aiPaused: conversation.aiPaused,
    },
    lead: leadRow
      ? { ...leadRow, createdAt: leadRow.createdAt.toISOString(), updatedAt: leadRow.updatedAt.toISOString() }
      : null,
    messages: thread.map((m) => ({
      id: m.id,
      from: m.from,
      sentBy: m.sentBy,
      content: m.content,
      contentType: m.contentType,
      time: m.time.toISOString(),
      state: m.state,
    })),
  });
});

const inboxReplyInput = z.object({
  content: z.string().min(1).max(4000),
  pauseAi: z.boolean().optional(),
});

adminAiRouter.post('/admin/ai/inbox/:conversationId/reply', async (c) => {
  const input = inboxReplyInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'content is required' }, 400);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, c.req.param('conversationId')),
    with: { channel: true },
  });
  if (!conversation?.channel) return c.json({ error: 'Conversation not found' }, 404);

  const token = conversation.channel.apiToken;
  try {
    if (conversation.channel.platform === 'whatsapp') {
      await sendWhatsAppText(token, conversation.channel.platformChannelId, conversation.customerPlatformId, input.data.content);
    } else if (conversation.channel.platform === 'facebook' || conversation.channel.platform === 'instagram') {
      await sendMessage(token, conversation.customerPlatformId, input.data.content, {
        humanAgent: true,
        platform: conversation.channel.platform,
      });
    } else {
      return c.json({ error: `no send path for platform ${conversation.channel.platform}` }, 422);
    }
  } catch (err) {
    if (isFacebookSendError(err)) return c.json({ error: err.userMessage }, 422);
    return c.json({ error: sendErr(err) }, 502);
  }

  await createMessageRow({
    conversationId: conversation.id,
    from: 'self',
    sentBy: 'human',
    content: input.data.content,
    state: 'done',
  });
  await db
    .update(conversations)
    .set({ lastMessageState: 'done', lastStateAt: new Date() })
    .where(eq(conversations.id, conversation.id));
  if (input.data.pauseAi !== undefined) {
    await setConversationAiPaused(conversation.businessId, conversation.id, input.data.pauseAi);
  }
  return c.json({ sent: true }, 201);
});

const takeoverInput = z.object({ paused: z.boolean() });

adminAiRouter.post('/admin/ai/inbox/:conversationId/takeover', async (c) => {
  const input = takeoverInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'paused is required' }, 400);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, c.req.param('conversationId')),
    columns: { id: true, businessId: true },
  });
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

  const row = await setConversationAiPaused(conversation.businessId, conversation.id, input.data.paused);
  return c.json({ id: conversation.id, aiPaused: row?.aiPaused ?? input.data.paused });
});

/* ---------- comments overview (spec F) ---------- */

adminAiRouter.get('/admin/ai/businesses/:businessId/comments', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 100);
  const threadRows = await db
    .select({
      id: commentThreads.id,
      platform: channels.platform,
      platformItemId: commentThreads.platformItemId,
      commenterName: commentThreads.commenterName,
      lastCommentState: commentThreads.lastCommentState,
      createdAt: commentThreads.createdAt,
    })
    .from(commentThreads)
    .innerJoin(channels, eq(channels.id, commentThreads.channelId))
    .where(and(eq(commentThreads.businessId, c.req.param('businessId')), isNull(commentThreads.deletedAt)))
    .orderBy(desc(commentThreads.createdAt))
    .limit(limit);

  const rows = await Promise.all(
    threadRows.map(async (thread) => {
      const latest = await db.query.comments.findFirst({
        where: and(eq(comments.commentThreadId, thread.id), isNull(comments.deletedAt)),
        orderBy: [desc(comments.time)],
      });
      return { ...thread, createdAt: thread.createdAt.toISOString(), latest };
    }),
  );

  return c.json({ comments: rows });
});

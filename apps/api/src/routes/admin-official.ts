import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { db } from '@repo/db/client';
import { channels, conversations, messages, tickets as ticketsTable } from '@repo/db/schema';
import { logsAuthMiddleware } from '@api/middleware/logs-access';
import {
  ChannelTakenError,
  listAdminChannels,
  upsertAdminChannel,
} from '@repo/db/crud/channel';
import { setConversationAiPaused } from '@repo/db/crud/conversation';
import {
  addTicketNote,
  getProspectById,
  getSettings,
  getTicketById,
  getWeights,
  listProspectEvents,
  listProspects,
  listTicketEvents,
  listTickets,
  rescoreProspects,
  saveWeights,
  updateProspect,
  updateSettings,
  updateTicket,
} from '@repo/db/crud/official';
import { verifyWhatsAppPhoneNumber } from '@repo/integrations/whatsapp';
import { getPageIdForToken } from '@repo/integrations/facebook';
import { officialHumanReply, officialConversationPlatform } from '@api/lib/official';
import {
  officialReplySchema,
  officialSettingsSchema,
  officialTakeoverSchema,
  prospectListQuerySchema,
  prospectPatchSchema,
  prospectWeightsSchema,
  ticketListQuerySchema,
  ticketNoteSchema,
  ticketPatchSchema,
} from '@repo/shared';

/**
 * The Official Channels API (spec B–H): the operator's own Facebook/Instagram Pages and
 * WhatsApp number, the AI that answers people on them, the tickets and prospects that come
 * out of those conversations. Every route sits behind the logs console's bearer session
 * (logsAuthMiddleware), under /api2/admin/official/*.
 */

export const adminOfficialRouter = new OpenAPIHono();

adminOfficialRouter.use('/admin/official', logsAuthMiddleware);
adminOfficialRouter.use('/admin/official/*', logsAuthMiddleware);

const sendErr = (err: unknown) => (err instanceof Error ? err.message : 'Internal Server Error');

function channelTakenMessage(err: unknown): string {
  return err instanceof ChannelTakenError
    ? 'This account answers a store already; disconnect it there first'
    : sendErr(err);
}

/* ---------- settings: availability + AI policy (one singleton row) ---------- */

adminOfficialRouter.get('/admin/official/settings', async (c) => {
  const row = await getSettings();
  return c.json({
    availability: row.availability,
    availabilityNote: row.availabilityNote,
    aiEnabled: row.aiEnabled,
    autoReply: row.autoReply,
    tone: row.tone,
    language: row.language,
    instructions: row.instructions,
    updatedAt: row.updatedAt.toISOString(),
  });
});

adminOfficialRouter.patch('/admin/official/settings', async (c) => {
  const parsed = officialSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid settings payload', details: parsed.error.flatten() }, 400);
  }
  const row = await updateSettings(parsed.data);
  return c.json({
    availability: row.availability,
    availabilityNote: row.availabilityNote,
    aiEnabled: row.aiEnabled,
    autoReply: row.autoReply,
    tone: row.tone,
    language: row.language,
    instructions: row.instructions,
    updatedAt: row.updatedAt.toISOString(),
  });
});

/* ---------- channels: list, verify, disconnect, WhatsApp connect ---------- */

const CHANNEL_LABELS = ['facebook', 'instagram', 'whatsapp'] as const;

adminOfficialRouter.get('/admin/official/channels', async (c) => {
  const rows = await listAdminChannels();
  return c.json({
    channels: rows.map((row) => {
      let label = row.platformChannelId;
      try {
        const extra = JSON.parse(row.extraInfo ?? '{}') as {
          pageName?: string;
          displayPhoneNumber?: string;
        };
        label = extra.pageName ?? extra.displayPhoneNumber ?? label;
      } catch {
        // A row without a label keeps its platform account id.
      }
      return {
        id: row.id,
        platform: row.platform,
        platformChannelId: row.platformChannelId,
        label,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  });
});

const waConnectInput = z.object({
  token: z.string().min(1),
  phoneNumberId: z.string().min(1),
});

/**
 * WhatsApp connect: a manual token, never a customer OAuth. The builtin verify step talks
 * to Graph first; a connected state is only written when the token really answered.
 */
adminOfficialRouter.post('/admin/official/channels/whatsapp/connect', async (c) => {
  const input = waConnectInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'token and phoneNumberId are required' }, 400);

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
    const channel = await upsertAdminChannel({
      platform: 'whatsapp',
      platformChannelId: input.data.phoneNumberId,
      apiToken: input.data.token,
      pageName: identity.displayPhoneNumber ?? identity.verifiedName ?? input.data.phoneNumberId,
    });
    return c.json({
      id: channel.id,
      created: channel.created,
      status: 'linked' as const,
      displayPhoneNumber: identity.displayPhoneNumber ?? null,
      verifiedName: identity.verifiedName ?? null,
    });
  } catch (err) {
    if (err instanceof ChannelTakenError) return c.json({ error: channelTakenMessage(err) }, 409);
    return c.json({ error: sendErr(err) }, 500);
  }
});

/** Health check: re-verify the stored token against the platform it belongs to. */
adminOfficialRouter.get('/admin/official/channels/:channelId/verify', async (c) => {
  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.id, c.req.param('channelId')),
      eq(channels.isAdminOnly, true),
      isNull(channels.deletedAt),
    ),
    columns: { id: true, platform: true, apiToken: true, platformChannelId: true },
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

/**
 * Disconnect: soft delete only — the row keeps its audit trail and the account can be
 * re-connected later with a fresh token verify. Webhook deliveries after this are skipped
 * as unknown, never answered.
 */
adminOfficialRouter.post('/admin/official/channels/:channelId/disconnect', async (c) => {
  const channel = await db.query.channels.findFirst({
    where: and(
      eq(channels.id, c.req.param('channelId')),
      eq(channels.isAdminOnly, true),
      isNull(channels.deletedAt),
    ),
    columns: { id: true },
  });
  if (!channel) return c.json({ error: 'Channel not found' }, 404);
  // An admin-only channel has no business; the deletion is straight and whole.
  await db.update(channels).set({ deletedAt: new Date() }).where(eq(channels.id, channel.id));
  return c.json({ id: channel.id, disconnected: true });
});

/* ---------- conversations: the official inbox ---------- */

adminOfficialRouter.get('/admin/official/conversations', async (c) => {
  const parsed = z
    .object({
      channelId: z.string().uuid().optional(),
      platform: z.enum(CHANNEL_LABELS).optional(),
      status: z.enum(['pending', 'done', 'all']).optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .safeParse({
      channelId: c.req.query('channelId') || undefined,
      platform: c.req.query('platform') || undefined,
      status: c.req.query('status') || 'all',
      limit: c.req.query('limit') || undefined,
      offset: c.req.query('offset') || undefined,
    });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  const q = parsed.data;

  const conditions = [isNull(conversations.deletedAt), isNull(conversations.businessId)];
  if (q.channelId) conditions.push(eq(conversations.channelId, q.channelId));
  if (q.status === 'pending') conditions.push(eq(conversations.lastMessageState, 'pending'));
  if (q.platform) conditions.push(eq(channels.platform, q.platform));

  const rows = await db
    .select({
      id: conversations.id,
      channelId: conversations.channelId,
      platform: channels.platform,
      customerPlatformId: conversations.customerPlatformId,
      customerName: conversations.customerName,
      aiPaused: conversations.aiPaused,
      lastMessageState: conversations.lastMessageState,
      stateAt: conversations.stateAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(and(...conditions))
    .orderBy(desc(conversations.stateAt))
    .limit(Math.min(q.limit ?? 50, 100))
    .offset(q.offset ?? 0);

  return c.json({
    conversations: rows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      platform: row.platform,
      customerPlatformId: row.customerPlatformId,
      customerName: row.customerName,
      aiPaused: row.aiPaused,
      status: row.lastMessageState,
      stateAt: row.stateAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

adminOfficialRouter.get('/admin/official/conversations/:conversationId', async (c) => {
  const id = c.req.param('conversationId');
  const ctx = await officialConversationPlatform(id);
  if (!ctx) return c.json({ error: 'Conversation not found on an official channel' }, 404);

  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  const [thread, convTickets] = await Promise.all([
    db
      .select({
        id: messages.id,
        from: messages.from,
        sentBy: messages.sentBy,
        state: messages.state,
        content: messages.content,
        time: messages.time,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, id), isNull(messages.deletedAt)))
      .orderBy(desc(messages.time))
      .limit(200),
    db
      .select()
      .from(ticketsTable)
      .where(and(eq(ticketsTable.conversationId, id), isNull(ticketsTable.deletedAt)))
      .orderBy(desc(ticketsTable.createdAt)),
  ]);

  return c.json({
    conversation: {
      id: conv.id,
      channelId: ctx.id,
      platform: ctx.platform,
      customerPlatformId: conv.customerPlatformId,
      customerName: conv.customerName,
      aiPaused: conv.aiPaused,
      status: conv.lastMessageState,
      stateAt: conv.stateAt.toISOString(),
      createdAt: conv.createdAt.toISOString(),
    },
    messages: thread
      .map((row) => ({
        id: row.id,
        from: row.from,
        sentBy: row.sentBy,
        state: row.state,
        content: row.content,
        time: row.time.toISOString(),
      }))
      .reverse(),
    tickets: convTickets.map(serializeTicket),
  });
});

adminOfficialRouter.post('/admin/official/conversations/:conversationId/reply', async (c) => {
  const bodyParse = officialReplySchema.safeParse(await c.req.json().catch(() => null));
  if (!bodyParse.success) return c.json({ error: 'content is required' }, 400);
  const convId = c.req.param('conversationId');
  const ctx = await officialConversationPlatform(convId);
  if (!ctx) return c.json({ error: 'Conversation not found on an official channel' }, 404);
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, convId),
    columns: { customerPlatformId: true },
  });
  if (!conv) return c.json({ error: 'Conversation not found' }, 404);

  try {
    await officialHumanReply(ctx, convId, conv.customerPlatformId, bodyParse.data.content, bodyParse.data.paused);
    return c.json({ sent: true, conversationId: convId });
  } catch (err) {
    return c.json({ error: sendErr(err) }, 500);
  }
});

adminOfficialRouter.post('/admin/official/conversations/:conversationId/takeover', async (c) => {
  const bodyParse = officialTakeoverSchema.safeParse(await c.req.json().catch(() => null));
  if (!bodyParse.success) return c.json({ error: 'paused is required' }, 400);
  const convId = c.req.param('conversationId');
  const ctx = await officialConversationPlatform(convId);
  if (!ctx) return c.json({ error: 'Conversation not found on an official channel' }, 404);
  const row = await setConversationAiPaused(convId, bodyParse.data.paused);
  if (!row) return c.json({ error: 'Conversation not found' }, 404);
  return c.json({ conversationId: row.conversationId, aiPaused: row.aiPaused });
});

/* ---------- tickets: support + security ---------- */

function serializeTicket(row: typeof ticketsTable.$inferSelect) {
  return {
    id: row.id,
    channelId: row.channelId,
    conversationId: row.conversationId,
    customerPlatformId: row.customerPlatformId,
    customerName: row.customerName,
    type: row.type,
    subject: row.subject,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

adminOfficialRouter.get('/admin/official/tickets', async (c) => {
  const parsed = ticketListQuerySchema.safeParse({
    type: c.req.query('type') || undefined,
    status: c.req.query('status') || undefined,
    priority: c.req.query('priority') || undefined,
    channelId: c.req.query('channelId') || undefined,
    search: c.req.query('search') || undefined,
    limit: c.req.query('limit') || undefined,
    offset: c.req.query('offset') || undefined,
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  const rows = await listTickets(parsed.data);
  return c.json({ tickets: rows.map(serializeTicket) });
});

adminOfficialRouter.get('/admin/official/tickets/:ticketId', async (c) => {
  const row = await getTicketById(c.req.param('ticketId'));
  if (!row) return c.json({ error: 'Ticket not found' }, 404);
  const events = await listTicketEvents(row.id);
  return c.json({
    ticket: serializeTicket(row),
    events: events.map((ev) => ({
      id: ev.id,
      kind: ev.kind,
      data: ev.data,
      createdAt: ev.createdAt.toISOString(),
    })),
  });
});

adminOfficialRouter.patch('/admin/official/tickets/:ticketId', async (c) => {
  const parsed = ticketPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid ticket patch' }, 400);
  const row = await updateTicket(c.req.param('ticketId'), parsed.data, { kind: 'operator' });
  if (!row) return c.json({ error: 'Ticket not found' }, 404);
  return c.json({ ticket: serializeTicket(row) });
});

adminOfficialRouter.post('/admin/official/tickets/:ticketId/notes', async (c) => {
  const parsed = ticketNoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'note is required' }, 400);
  const row = await addTicketNote(c.req.param('ticketId'), parsed.data.note, { kind: 'operator' });
  if (!row) return c.json({ error: 'Ticket not found' }, 404);
  return c.json({ ticket: serializeTicket(row) });
});

/* ---------- prospects: onboarding pipeline + scoring weights ---------- */

adminOfficialRouter.get('/admin/official/prospects', async (c) => {
  const parsed = prospectListQuerySchema.safeParse({
    status: c.req.query('status') || undefined,
    channelId: c.req.query('channelId') || undefined,
    search: c.req.query('search') || undefined,
    limit: c.req.query('limit') || undefined,
    offset: c.req.query('offset') || undefined,
  });
  if (!parsed.success) return c.json({ error: 'Invalid query' }, 400);
  const [rows, weights] = await Promise.all([listProspects(parsed.data), getWeights()]);
  return c.json({
    prospects: rows.map((row) => ({
      id: row.id,
      channelId: row.channelId,
      conversationId: row.conversationId,
      platform: row.platform,
      contactPlatformId: row.contactPlatformId,
      name: row.name,
      country: row.country,
      businessType: row.businessType,
      employeesEstimate: row.employeesEstimate,
      budget: row.budget,
      needs: row.needs,
      consent: row.consent,
      score: row.score,
      scoreBreakdown: row.scoreBreakdown,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    weights: weights.weights,
  });
});

adminOfficialRouter.get('/admin/official/prospects/:prospectId', async (c) => {
  const row = await getProspectById(c.req.param('prospectId'));
  if (!row) return c.json({ error: 'Prospect not found' }, 404);
  return c.json({ prospect: row });
});

adminOfficialRouter.patch('/admin/official/prospects/:prospectId', async (c) => {
  const parsed = prospectPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid prospect patch' }, 400);
  const row = await updateProspect(c.req.param('prospectId'), parsed.data, { kind: 'operator' });
  if (!row) return c.json({ error: 'Prospect not found' }, 404);
  return c.json({ prospect: row });
});

adminOfficialRouter.get('/admin/official/prospects/:prospectId/events', async (c) => {
  const rows = await listProspectEvents(c.req.param('prospectId'));
  return c.json({
    events: rows.map((ev) => ({
      id: ev.id,
      kind: ev.kind,
      data: ev.data,
      actor: ev.actor,
      createdAt: ev.createdAt.toISOString(),
    })),
  });
});

adminOfficialRouter.post('/admin/official/prospects/rescore', async (c) => {
  const rescanned = await rescoreProspects();
  return c.json({ rescanned });
});

adminOfficialRouter.get('/admin/official/prospect-weights', async (c) => {
  const { row, weights } = await getWeights();
  return c.json({ weights, updatedAt: row.updatedAt.toISOString() });
});

adminOfficialRouter.patch('/admin/official/prospect-weights', async (c) => {
  const parsed = prospectWeightsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid weights payload' }, 400);
  const weights = await saveWeights(parsed.data);
  const rescanned = await rescoreProspects();
  return c.json({ weights, rescanned });
});

/* ---------- TikTok: honest limits (spec H) ---------- */

adminOfficialRouter.get('/admin/official/tiktok', async (c) => {
  return c.json({
    platform: 'tiktok',
    connected: false,
    available: false,
    reason: 'TikTok Business Messages is not yet offered publicly; OnlyOrders connects it when a public partner API exists.',
  });
});

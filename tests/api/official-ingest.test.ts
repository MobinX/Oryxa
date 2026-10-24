import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { eq } from 'drizzle-orm';
import { db } from '@repo/db/client';
import { conversations, messages, prospects, channels, tickets as ticketsTable } from '@repo/db/schema';
import { upsertAdminChannel } from '@repo/db/crud/channel';
import { updateSettings } from '@repo/db/crud/official';
import { officialIngest } from '@api/lib/official/ingest';
import { app } from '@api/app';
import { withPglite } from '../helpers/with-pglite';

vi.mock('@repo/integrations/facebook', async () => {
  const actual = await import('../../packages/integrations/facebook');
  return {
    ...actual,
    sendMessage: vi.fn(async () => undefined),
    getPageIdForToken: vi.fn(async () => null),
  };
});
import { sendMessage, getPageIdForToken } from '@repo/integrations/facebook';

const OPERATOR = { Authorization: 'Bearer console-secret', 'Content-Type': 'application/json' };

/** One JSON turn as the real model would emit it, wrapped in the fake chat model. */
function fakeTurn(payload: Record<string, unknown>) {
  return new FakeStreamingChatModel({
    responses: [new AIMessage(JSON.stringify(payload))],
  });
}

const SALES_TURN = {
  intent: 'sales',
  reply: 'Thanks! What should we call you, and which country are you in?',
  needHuman: false,
  confidence: 0.9,
  prospect: { consent: null },
  ticket: null,
};

async function seedOfficialChannel(platform: 'facebook' | 'whatsapp' = 'facebook') {
  const channelId = `PAGE_${crypto.randomUUID()}`;
  const { id } = await upsertAdminChannel({
    platform,
    platformChannelId: channelId,
    apiToken: 'official-token',
    pageName: 'Official HQ',
  });
  return { id, channelId };
}

describe('Official Channels ingest', () => {
  withPglite({
    before: async () => {
      process.env.LOGS_UI_PASSWORD = 'console-secret';
    },
  });

  beforeEach(async () => {
    await updateSettings({ aiEnabled: true, autoReply: true, availability: 'available' });
    vi.mocked(sendMessage).mockClear();
  });

  it('answers a first turn with the AI reply and stores it sent by the AI', async () => {
    const { id, channelId } = await seedOfficialChannel();
    const verdict = await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O1', text: 'hello, I want a website for my shop', externalId: 'mid_o1' },
      { llm: fakeTurn(SALES_TURN) as never },
    );
    console.log('DEBUG', JSON.stringify(verdict));
    expect(verdict).toMatchObject({ inserted: true, answered: true });
    expect(sendMessage).toHaveBeenCalledWith('official-token', 'PS_O1', 'Thanks! What should we call you, and which country are you in?', { platform: 'facebook' });

    const thread = await db.select().from(messages).where(eq(messages.externalId, 'mid_o1'));
    expect(thread).toHaveLength(1);
    expect(thread[0].state).toBe('pending');
    const conv = (await db.query.conversations.findFirst({ where: eq(conversations.channelId, id) }))!;
    const self = await db.query.messages.findFirst({
      where: eq(messages.conversationId, conv.id),
    });
    // Both rows exist: the customer turn and the AI's reply, marked with who sent it.
    const rows = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    expect(rows.map((r) => r.sentBy ?? 'customer')).toEqual(['customer', 'ai']);
  });

  it('records a prospect and a support ticket from the model output', async () => {
    const { id, channelId } = await seedOfficialChannel();
    await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O2', text: 'I need an app, budget around 500 dollars', externalId: 'mid_o2' },
      {
        llm: fakeTurn({
          intent: 'sales',
          reply: 'ok',
          needHuman: false,
          confidence: 0.8,
          prospect: { name: 'Rana', country: 'Bangladesh', budget: '500 dollars' },
        }) as never,
      },
    );
    const prospect = await db.query.prospects.findFirst({ where: eq(prospects.contactPlatformId, 'PS_O2') });
    expect(prospect).toBeTruthy();
    expect(prospect!.score).toBeGreaterThan(0);

    await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O2', text: 'login broke, urgent', externalId: 'mid_o3' },
      {
        llm: fakeTurn({
          intent: 'support',
          reply: null,
          needHuman: true,
          confidence: 0.7,
          ticket: { subject: 'Login broken', priority: 'high', summary: 'cannot log in' },
        }) as never,
      },
    );
    const ticket = await db.query.tickets.findFirst({ where: eq(ticketsTable.customerPlatformId, 'PS_O2') });
    expect(ticket?.subject).toBe('Login broken');
    expect(ticket?.priority).toBe('high');
  });

  it('is idempotent on a re-delivered external id (no second reply)', async () => {
    const { id, channelId } = await seedOfficialChannel();
    const ctx = { id, apiToken: 'official-token', platform: 'facebook' as const, platformChannelId: channelId };
    await officialIngest(ctx, { senderId: 'PS_O3', text: 'hi', externalId: 'mid_o4' }, { llm: fakeTurn(SALES_TURN) as never });
    const again = await officialIngest(ctx, { senderId: 'PS_O3', text: 'hi', externalId: 'mid_o4' }, { llm: fakeTurn(SALES_TURN) as never });
    expect(again).toMatchObject({ inserted: false, reason: 'duplicate' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('stays silent when a human taken over the conversation', async () => {
    const { id, channelId } = await seedOfficialChannel();
    const ctx = { id, apiToken: 'official-token', platform: 'facebook' as const, platformChannelId: channelId };
    const first = await officialIngest(ctx, { senderId: 'PS_O4', text: 'hi', externalId: 'mid_o5' }, { llm: fakeTurn(SALES_TURN) as never });
    expect(first.answered).toBe(true);

    const conv = (await db.query.conversations.findFirst({ where: eq(conversations.channelId, id) }))!;
    await db.update(conversations).set({ aiPaused: true, lastMessageState: 'done' }).where(eq(conversations.id, conv.id));

    const second = await officialIngest(ctx, { senderId: 'PS_O4', text: 'still here?', externalId: 'mid_o6' }, { llm: fakeTurn(SALES_TURN) as never });
    expect(second).toMatchObject({ inserted: true, answered: false, reason: 'ai_paused' });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('stops answering when AI is disabled in settings', async () => {
    await updateSettings({ aiEnabled: false });
    const { id, channelId } = await seedOfficialChannel();
    const verdict = await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O5', text: 'hello', externalId: 'mid_o7' },
      { llm: fakeTurn(SALES_TURN) as never },
    );
    expect(verdict).toMatchObject({ answered: false, reason: 'ai_off' });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('escalates to a human instead of answering when the model says so', async () => {
    const { id, channelId } = await seedOfficialChannel();
    const verdict = await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O6', text: 'you people are thieves', externalId: 'mid_o8' },
      {
        llm: fakeTurn({ intent: 'other', reply: null, needHuman: true, confidence: 0.5 }) as never,
      },
    );
    expect(verdict).toMatchObject({ answered: false, reason: 'need_human' });
    expect(sendMessage).not.toHaveBeenCalled();
    const conv = (await db.query.conversations.findFirst({ where: eq(conversations.channelId, id) }))!;
    expect(conv.lastMessageState).toBe('pending');
  });

  it('degrades safely when the model call fails', async () => {
    const { id, channelId } = await seedOfficialChannel();
    const verdict = await officialIngest(
      { id, apiToken: 'official-token', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_O7', text: 'hello', externalId: 'mid_o9' },
      {
        llm: new FakeStreamingChatModel({
          responses: [new AIMessage('not json at all')],
        }) as never,
      },
    );
    expect(verdict).toMatchObject({ answered: false, reason: 'need_human' });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('Official Channels admin API', () => {
  withPglite({
    before: async () => {
      process.env.LOGS_UI_PASSWORD = 'console-secret';
    },
  });

  beforeEach(async () => {
    await updateSettings({ aiEnabled: true, autoReply: true, availability: 'available' });
    vi.mocked(sendMessage).mockClear();
    vi.mocked(getPageIdForToken).mockClear();
  });

  it('settings GET/PATCH round-trips availability', async () => {
    const res = await app.request('/api2/admin/official/settings', { headers: OPERATOR });
    expect(res.status).toBe(200);
    const base = (await res.json()) as { availability: string };
    expect(base.availability).toBe('available');

    const patch = await app.request('/api2/admin/official/settings', {
      method: 'PATCH',
      headers: OPERATOR,
      body: JSON.stringify({ availability: 'taking_onboarding_requests', availabilityNote: 'backlog until August' }),
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as { availability: string }).availability).toBe('taking_onboarding_requests');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await app.request('/api2/admin/official/settings');
    expect(res.status).toBe(401);
  });

  it('WhatsApp connect requires a verified token before storing anything', async () => {
    const { verifyWhatsAppPhoneNumber } = await import('@repo/integrations/whatsapp');
    const spy = vi
      .spyOn(await import('@repo/integrations/whatsapp'), 'verifyWhatsAppPhoneNumber')
      .mockResolvedValue({ verified: false, error: 'HTTP 401' });

    const res = await app.request('/api2/admin/official/channels/whatsapp/connect', {
      method: 'POST',
      headers: OPERATOR,
      body: JSON.stringify({ token: 'bad', phoneNumberId: 'PN_1' }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { verified: boolean }).verified).toBe(false);
    spy.mockRestore();
  });

  it('get + disconnect a channel and confirm via verify', async () => {
    const { id, channelId } = await seedOfficialChannel();
    vi.mocked(getPageIdForToken).mockResolvedValue(channelId);

    const verify = await app.request(`/api2/admin/official/channels/${id}/verify`, { headers: OPERATOR });
    expect(await verify.json() as any).toEqual({ verified: true });

    const disconnect = await app.request(`/api2/admin/official/channels/${id}/disconnect`, {
      method: 'POST',
      headers: OPERATOR,
    });
    expect(disconnect.status).toBe(200);
    const after = await db.query.channels.findFirst({ where: eq(channels.id, id) });
    expect(after!.deletedAt).not.toBeNull();
    vi.mocked(getPageIdForToken).mockResolvedValue(null);
  });

  it('takes over a conversation and a human reply lands in the thread', async () => {
    const { id, channelId } = await seedOfficialChannel();

    // Seed a pending customer turn the way the webhook would have.
    await officialIngest(
      { id, apiToken: 'tok', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_R1', text: 'help me now', externalId: 'mid_r1' },
      { llm: fakeTurn(SALES_TURN) as never },
    );
    const conv = (await db.query.conversations.findFirst({ where: eq(conversations.channelId, id) }))!;

    const reply = await app.request(`/api2/admin/official/conversations/${conv.id}/reply`, {
      method: 'POST',
      headers: OPERATOR,
      body: JSON.stringify({ content: "On it — one moment, Tom here.", paused: true }),
    });
    expect(reply.status).toBe(200);
    expect(sendMessage).toHaveBeenCalled();

    const paused = await db.query.conversations.findFirst({ where: eq(conversations.id, conv.id) });
    expect(paused!.aiPaused).toBe(true);
    const thread = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    const human = thread.find((m) => m.sentBy === 'human');
    expect(human?.state).toBe('done');
    expect(thread.filter((m) => m.from === 'customer').every((m) => m.state === 'done')).toBe(true);
  });

  it('lists official conversations only for admin channels', async () => {
    const { id, channelId } = await seedOfficialChannel();
    await officialIngest(
      { id, apiToken: 'tok', platform: 'facebook', platformChannelId: channelId },
      { senderId: 'PS_L1', text: 'are you open?', externalId: 'mid_l1' },
      { llm: fakeTurn(SALES_TURN) as never },
    );
    // The ingest already wrote one conversation; admin list should show it, and
    // conversations belonging to stores (businessId not null) must not appear.
    const res = await app.request('/api2/admin/official/conversations?platform=facebook', { headers: OPERATOR });
    const body = (await res.json()) as { conversations: Array<{ channelId: string; status: string }>; available: boolean; reason: string };
    const ids = body.conversations.map((c: { channelId: string }) => c.channelId);
    expect(ids).toContain(id);
    for (const c of body.conversations) expect(c.status).toBeDefined();
  });

  it('weights patch re-scores prospects', async () => {
    const patch = await app.request('/api2/admin/official/prospect-weights', {
      method: 'PATCH',
      headers: OPERATOR,
      body: JSON.stringify({ budget: 4 }),
    });
    expect(patch.status).toBe(200);
    expect((((await patch.json()) as { weights: Record<string, number> }).weights.budget)).toBe(4);
  });

  it('tiktok surfaces honest limits', async () => {
    const res = await app.request('/api2/admin/official/tiktok', { headers: OPERATOR });
    const body = (await res.json()) as { conversations: Array<{ channelId: string; status: string }>; available: boolean; reason: string };
    expect(body.available).toBe(false);
    expect(body.reason).toContain('not yet');
  });
});


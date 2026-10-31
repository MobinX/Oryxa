import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { createChannel } from '@repo/db/crud/channel';
import { updateBusiness } from '@repo/db/crud/business';
import { getOrCreateConversation } from '@repo/db/crud/conversation';
import { getOrderById } from '@repo/db/crud/order';
import { app } from '@api/app';

const sendMessageMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  getFacebookOAuthUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  getUserPages: vi.fn(),
  verifyWebhookSignature: vi.fn(() => true),
  isFacebookSendError: (err: unknown) =>
    err instanceof Error && err.name === 'FacebookSendError' && 'userMessage' in err,
}));

describe('Conversations API', () => {
  withPglite();

  it('GET /:businessId/conversations lists threads', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/conversations`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json() as any).length).toBeGreaterThan(0);
  });

  /**
   * The playground lists one sandbox channel's chats, and a store's real threads live on other
   * channels of the same business — so a caller that asks for one channel must get only that one.
   */
  it('GET /:businessId/conversations scopes to a channel and pages it', async () => {
    const seed = await seedTestWorld();
    const other = await createChannel(seed.business.id, {
      platform: 'facebook',
      apiToken: 'page-token-test',
      platformChannelId: `OTHER_${crypto.randomUUID()}`,
      agentId: seed.agent.id,
    });
    await getOrCreateConversation(seed.business.id, other.id, 'ANOTHER_CUSTOMER');

    const scoped = await app.request(
      `/api/v1/${seed.business.id}/conversations?channelId=${seed.channel.id}`,
      { headers: authHeaders() },
    );
    expect(scoped.status).toBe(200);
    const rows = (await scoped.json()) as { channelId: string }[];
    expect(rows.map((row) => row.channelId)).toEqual([seed.channel.id]);

    const firstPage = await app.request(
      `/api/v1/${seed.business.id}/conversations?channelId=${seed.channel.id}&limit=1`,
      { headers: authHeaders() },
    );
    expect(((await firstPage.json()) as unknown[]).length).toBe(1);

    const secondPage = await app.request(
      `/api/v1/${seed.business.id}/conversations?channelId=${seed.channel.id}&limit=1&offset=1`,
      { headers: authHeaders() },
    );
    expect(((await secondPage.json()) as unknown[]).length).toBe(0);
  });

  it('GET /:businessId/conversations/:id/messages returns messages', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/messages`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json() as any)).toBe(true);
  });

  it('POST /:businessId/conversations/:id/messages sends human reply', async () => {
    const seed = await seedTestWorld();
    sendMessageMock.mockClear();
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/messages`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: 'Human reply here', contentType: 'text' }),
      },
    );
    expect(res.status).toBe(201);
    expect(sendMessageMock).toHaveBeenCalledWith(
      'page-token-test',
      'CUSTOMER_FB_ID',
      'Human reply here',
      { humanAgent: true, platform: 'facebook' },
    );
  });

  it('POST /:businessId/conversations/:id/messages returns 422 when Facebook rejects the send', async () => {
    const fbErr = Object.assign(new Error('Facebook send message failed'), {
      name: 'FacebookSendError',
      userMessage:
        "Facebook only allows a reply within 24 hours of the customer's last message. Ask them to send you a message, then try again.",
    });
    sendMessageMock.mockRejectedValueOnce(fbErr);
    const seed = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/messages`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: 'Too late', contentType: 'text' }),
      },
    );
    expect(res.status).toBe(422);
    expect((await res.json() as any).error).toMatch(/24 hours/);
  });

  it('PATCH /:businessId/conversations/:id/auto-pilot switches the thread', async () => {
    const seed = await seedTestWorld();
    const off = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/auto-pilot`,
      { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ autoPilot: false }) },
    );
    expect(off.status).toBe(200);
    expect((await off.json() as any).autoPilot).toBe(false);

    const list = await app.request(
      `/api/v1/${seed.business.id}/conversations?limit=100`,
      { headers: authHeaders() },
    );
    const rows = (await list.json()) as Array<{ id: string; autoPilot: boolean }>;
    expect(rows.find((row) => row.id === seed.conversation.id)?.autoPilot).toBe(false);

    const on = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/auto-pilot`,
      { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ autoPilot: true }) },
    );
    expect((await on.json() as any).autoPilot).toBe(true);
  });

  it('refuses to switch auto pilot on while the business agent is off', async () => {
    const seed = await seedTestWorld();
    await updateBusiness(seed.business.id, seed.user.id, { agentState: false });

    const on = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/auto-pilot`,
      { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ autoPilot: true }) },
    );
    expect(on.status).toBe(409);

    // Turning a thread off stays allowed: it is the safe direction.
    const off = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/auto-pilot`,
      { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ autoPilot: false }) },
    );
    expect(off.status).toBe(200);
  });

  it('POST suggestions answers empty without running the model while auto pilot is on', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/suggestions`,
      { method: 'POST', headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ forMessageId: null, suggestions: [] });
  });

  it('POST /:businessId/conversations/:id/orders links the order to the conversation customer', async () => {
    const seed = await seedTestWorld();
    const variantId = seed.productDetail.variants[0]?.id;
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/orders`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          productId: seed.productDetail.id,
          variantId,
          count: 2,
          customerName: 'Chat Buyer',
          customerPhone: '01712345678',
          customerAddress: '12 Test Road, Dhaka',
          paymentMethod: 'Cash on delivery',
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; customerId: string | null; totalPrice: number };
    expect(body.id).toBeTruthy();
    expect(body.customerId).toBeTruthy();
    expect(body.totalPrice).toBeGreaterThan(0);

    const order = await getOrderById(seed.business.id, body.id);
    expect(order?.conversationId).toBe(seed.conversation.id);
    expect(order?.customerId).toBe(body.customerId);
  });

  it('GET /:businessId/conversations/:id/order-defaults prefills from the last order', async () => {
    const seed = await seedTestWorld();
    const created = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/orders`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          productId: seed.productDetail.id,
          variantId: seed.productDetail.variants[0]?.id,
          count: 3,
          customerName: 'Chat Buyer',
          customerPhone: '01712345678',
          customerAddress: '12 Test Road, Dhaka',
        }),
      },
    );
    expect(created.status).toBe(200);

    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/order-defaults`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      count: 3,
      customerPhone: '01712345678',
      customerAddress: '12 Test Road, Dhaka',
    });
  });

  it('PATCH /:businessId/conversations/:id/state updates state', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(
      `/api/v1/${seed.business.id}/conversations/${seed.conversation.id}/state`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ state: 'done' }),
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json() as any).updatedState).toBe('done');
  });
});

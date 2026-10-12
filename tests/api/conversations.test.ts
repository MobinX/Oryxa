import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { createChannel } from '@repo/db/crud/channel';
import { getOrCreateConversation } from '@repo/db/crud/conversation';
import { app } from '@api/app';

const sendMessageMock = vi.fn(async () => undefined);
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
    expect((await res.json()).length).toBeGreaterThan(0);
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
    expect(Array.isArray(await res.json())).toBe(true);
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
      { humanAgent: true },
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
    expect((await res.json()).error).toMatch(/24 hours/);
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
    expect((await res.json()).updatedState).toBe('done');
  });
});

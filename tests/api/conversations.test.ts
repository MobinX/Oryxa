import { describe, it, expect, vi } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/index';

const sendMessageMock = vi.fn(async () => undefined);
vi.mock('@repo/integrations/facebook', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  getFacebookOAuthUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  getUserPages: vi.fn(),
  verifyWebhookSignature: vi.fn(() => true),
}));

describe('Conversations API', () => {
  withPglite();

  it('GET /:businessId/conversations lists threads', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/conversations`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
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
    );
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

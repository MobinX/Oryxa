import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/index';

vi.mock('@repo/integrations/facebook', () => ({
  getFacebookOAuthUrl: vi.fn(() => 'https://facebook.com/oauth'),
  exchangeCodeForToken: vi.fn(async () => 'user-token'),
  getUserPages: vi.fn(async () => [{ id: 'NEW_PAGE', name: 'Page', access_token: 'page-tok' }]),
  sendMessage: vi.fn(async () => undefined),
  verifyWebhookSignature: vi.fn(() => true),
}));

describe('Channels & Agents API', () => {
  withPglite();

  it('POST /:businessId/agents creates agent', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/agents`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: 'New Agent',
        systemPrompt: 'Sell products',
        platformType: 'facebook',
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBeDefined();
  });

  it('GET /:businessId/agents lists agents', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/agents`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  it('POST /:businessId/channels links channel', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        platform: 'facebook',
        apiToken: 'manual-token',
        platformChannelId: 'MANUAL_PAGE',
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('linked');
  });

  it('GET /:businessId/channels lists channels', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  it('PATCH /:businessId/channels/:channelId/agent updates agent binding', async () => {
    const seed = await seedTestWorld();
    const res = await app.request(`/api/v1/${seed.business.id}/channels/${seed.channel.id}/agent`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ agentId: seed.agent.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('GET /:businessId/channels/facebook/auth returns oauth url', async () => {
    const { business } = await seedTestWorld();
    const res = await app.request(`/api/v1/${business.id}/channels/facebook/auth`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('facebook.com');
  });
});

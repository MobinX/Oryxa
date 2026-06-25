import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import app from '@api/index';
import { listChannels } from '@repo/db/crud/channel';

const exchangeCodeForTokenMock = vi.fn();
const getUserPagesMock = vi.fn();

vi.mock('@repo/integrations/facebook', () => ({
  getFacebookOAuthUrl: vi.fn(() => 'https://facebook.com/oauth'),
  exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForTokenMock(...args),
  getUserPages: (...args: unknown[]) => getUserPagesMock(...args),
  sendMessage: vi.fn(async () => undefined),
  verifyWebhookSignature: vi.fn(() => true),
}));

describe('Facebook OAuth callback', () => {
  withPglite();
  beforeEach(() => {
    exchangeCodeForTokenMock.mockReset();
    getUserPagesMock.mockReset();
    process.env.WEB_URL = 'http://localhost:3000';
  });

  it('returns 400 when code or state is missing', async () => {
    const res = await app.request('/api/v1/auth/facebook/callback?code=only-code');
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Missing code or state');
  });

  it('redirects after successful OAuth and creates channel', async () => {
    const { business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'OAUTH_PAGE_1', name: 'OAuth Page', access_token: 'oauth-page-token' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${business.id}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      `http://localhost:3000/b/${business.id}/channels?connected=facebook`,
    );

    const channels = await listChannels(business.id);
    const oauthChannel = channels.find((c) => c.platformChannelId === 'OAUTH_PAGE_1');
    expect(oauthChannel?.apiToken).toBe('oauth-page-token');
  });

  it('returns 400 when user has no Facebook pages', async () => {
    const { business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${business.id}`,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('No pages found');
  });

  it('returns 500 when token exchange fails', async () => {
    const { business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockRejectedValue(new Error('token exchange failed'));

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=bad-code&state=${business.id}`,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('OAuth failed');
  });
});

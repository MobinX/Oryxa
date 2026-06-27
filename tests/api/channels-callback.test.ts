import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { listChannels } from '@repo/db/crud/channel';
import { createOAuthState, createFacebookPagesSelectionToken } from '@repo/integrations/facebook';

const exchangeCodeForTokenMock = vi.fn();
const getUserPagesMock = vi.fn();
const subscribeFacebookPageToWebhooksMock = vi.fn();

vi.mock('@repo/integrations/facebook', async () => {
  const actual = await vi.importActual<typeof import('@repo/integrations/facebook')>('@repo/integrations/facebook');
  return {
    ...actual,
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForTokenMock(...args),
    getUserPages: (...args: unknown[]) => getUserPagesMock(...args),
    subscribeFacebookPageToWebhooks: (...args: unknown[]) =>
      subscribeFacebookPageToWebhooksMock(...args),
  };
});

async function stateFor(businessId: string, userId: string) {
  return createOAuthState({ businessId, userId });
}

describe('Facebook OAuth callback', () => {
  withPglite();
  beforeEach(() => {
    exchangeCodeForTokenMock.mockReset();
    getUserPagesMock.mockReset();
    process.env.WEB_URL = 'http://localhost:3400';
  });

  it('returns 400 when code or state is missing', async () => {
    const res = await app.request('/api/v1/auth/facebook/callback?code=only-code');
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Missing code or state');
  });

  it('rejects an unsigned / tampered state', async () => {
    const { business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'OAUTH_PAGE_1', name: 'OAuth Page', access_token: 'oauth-page-token' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${business.id}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid or expired state');
  });

  it('redirects to page picker after OAuth (does not auto-connect)', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'OAUTH_PAGE_1', name: 'OAuth Page', access_token: 'oauth-page-token' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain(`http://localhost:3400/b/${business.id}/channels/connect-facebook?token=`);

    const channels = await listChannels(business.id);
    expect(channels.find((c) => c.platformChannelId === 'OAUTH_PAGE_1')).toBeUndefined();
  });

  it('returns 400 when user has no Facebook pages', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('No pages found');
  });

  it('returns 500 when token exchange fails', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockRejectedValue(new Error('token exchange failed'));

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=bad-code&state=${await stateFor(business.id, user.id)}`,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('OAuth failed');
  });
});

describe('Facebook page selection API', () => {
  withPglite();

  beforeEach(() => {
    subscribeFacebookPageToWebhooksMock.mockReset();
    subscribeFacebookPageToWebhooksMock.mockResolvedValue(undefined);
  });

  it('lists pending pages from a selection token', async () => {
    const { user, business } = await seedTestWorld();
    const token = await createFacebookPagesSelectionToken({
      businessId: business.id,
      userId: user.id,
      pages: [
        { id: 'PAGE_A', name: 'Page A', access_token: 'tok-a' },
        { id: 'PAGE_B', name: 'Page B', access_token: 'tok-b' },
      ],
    });

    const res = await app.request(
      `/api/v1/${business.id}/channels/facebook/pending?token=${encodeURIComponent(token)}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string; name: string; connected: boolean }>;
    expect(body).toHaveLength(2);
    expect(body.find((p) => p.id === 'PAGE_A')?.connected).toBe(false);
  });

  it('connects selected pages from a selection token', async () => {
    const { user, business } = await seedTestWorld();
    const token = await createFacebookPagesSelectionToken({
      businessId: business.id,
      userId: user.id,
      pages: [
        { id: 'SEL_PAGE_1', name: 'Selected One', access_token: 'sel-tok-1' },
        { id: 'SEL_PAGE_2', name: 'Selected Two', access_token: 'sel-tok-2' },
      ],
    });

    const res = await app.request(`/api/v1/${business.id}/channels/facebook/connect`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ token, pageIds: ['SEL_PAGE_1', 'SEL_PAGE_2'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: Array<{ pageId: string }> };
    expect(body.connected.map((c) => c.pageId).sort()).toEqual(['SEL_PAGE_1', 'SEL_PAGE_2']);

    const channels = await listChannels(business.id);
    expect(channels.some((c) => c.platformChannelId === 'SEL_PAGE_1')).toBe(true);
    expect(subscribeFacebookPageToWebhooksMock).toHaveBeenCalledTimes(2);
    expect(subscribeFacebookPageToWebhooksMock).toHaveBeenCalledWith('SEL_PAGE_1', 'sel-tok-1');
    expect(subscribeFacebookPageToWebhooksMock).toHaveBeenCalledWith('SEL_PAGE_2', 'sel-tok-2');
  });

  it('still connects the page when webhook subscription fails', async () => {
    const { user, business } = await seedTestWorld();
    subscribeFacebookPageToWebhooksMock.mockRejectedValue(new Error('subscription denied'));
    const token = await createFacebookPagesSelectionToken({
      businessId: business.id,
      userId: user.id,
      pages: [{ id: 'FAIL_PAGE', name: 'Fail Page', access_token: 'fail-tok' }],
    });

    const res = await app.request(`/api/v1/${business.id}/channels/facebook/connect`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ token, pageIds: ['FAIL_PAGE'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connected: Array<{ pageId: string }>;
      failed: Array<{ pageId: string; error: string }>;
    };
    expect(body.connected).toHaveLength(1);
    expect(body.connected[0]?.pageId).toBe('FAIL_PAGE');
    expect(body.failed).toEqual([{ pageId: 'FAIL_PAGE', error: 'subscription denied' }]);

    const channels = await listChannels(business.id);
    expect(channels.some((c) => c.platformChannelId === 'FAIL_PAGE')).toBe(true);
  });

  it('reactivates a soft-deleted channel instead of inserting a duplicate', async () => {
    const { user, business } = await seedTestWorld();
    const { deleteChannel } = await import('@repo/db/crud/channel');
    const existing = (await listChannels(business.id)).find((c) => c.platform === 'facebook');
    expect(existing).toBeDefined();
    await deleteChannel(business.id, existing!.id);

    const token = await createFacebookPagesSelectionToken({
      businessId: business.id,
      userId: user.id,
      pages: [
        {
          id: existing!.platformChannelId,
          name: 'Restored Page',
          access_token: 'restored-tok',
        },
      ],
    });

    const res = await app.request(`/api/v1/${business.id}/channels/facebook/connect`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ token, pageIds: [existing!.platformChannelId] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: Array<{ id: string; pageId: string }> };
    expect(body.connected).toHaveLength(1);
    expect(body.connected[0]?.id).toBe(existing!.id);

    const channels = await listChannels(business.id);
    expect(channels.some((c) => c.id === existing!.id)).toBe(true);
  });
});

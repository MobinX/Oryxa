import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { listChannels } from '@repo/db/crud/channel';
import {
  createOAuthState,
  createFacebookPagesSelectionToken,
  verifyFacebookPagesSelectionToken,
} from '@repo/integrations/facebook';

const exchangeCodeForTokenMock = vi.fn();
const getUserPagesMock = vi.fn();
const subscribeFacebookPageToWebhooksMock = vi.fn();
const getGrantedPermissionsMock = vi.fn();
const getPortfolioPagesMock = vi.fn();

vi.mock('@repo/integrations/facebook', async () => {
  const actual = await import('../../packages/integrations/facebook');
  return {
    ...actual,
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForTokenMock(...args),
    getUserPages: (...args: unknown[]) => getUserPagesMock(...args),
    subscribeFacebookPageToWebhooks: (...args: unknown[]) =>
      subscribeFacebookPageToWebhooksMock(...args),
    getGrantedPermissions: (...args: unknown[]) => getGrantedPermissionsMock(...args),
    getPortfolioPages: (...args: unknown[]) => getPortfolioPagesMock(...args),
  };
});

async function stateFor(businessId: string, userId: string, portfolio?: boolean) {
  return createOAuthState({ businessId, userId, portfolio });
}

/**
 * One PGlite for the whole file: each `withPglite()` call replays the migration set on its own
 * database, and two of them in one file is enough to blow the hook timeout on this box.
 */
withPglite({ timeoutMs: 300_000 });

describe('Facebook OAuth callback', () => {
  beforeEach(() => {
    exchangeCodeForTokenMock.mockReset();
    getUserPagesMock.mockReset();
    getGrantedPermissionsMock.mockReset();
    getPortfolioPagesMock.mockReset();
    // Default: Meta did grant the Page permission and the account holds no portfolio Pages,
    // so an empty /me/accounts means what it says.
    getGrantedPermissionsMock.mockResolvedValue(['pages_show_list', 'pages_messaging']);
    getPortfolioPagesMock.mockResolvedValue([]);
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

  it('merges portfolio pages into the picker when the login was started as portfolio-aware', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'PERSONAL_1', name: 'Personal Page', access_token: 'personal-tok' },
    ]);
    getPortfolioPagesMock.mockResolvedValue([
      // An admin Page shows up in both lists, and a Page without a token cannot be stored.
      { id: 'PERSONAL_1', name: 'Personal Page', accessToken: 'personal-tok', businessName: 'North Star Brands' },
      { id: 'PORT_PAGE_1', name: 'Portfolio Page', accessToken: 'port-tok-1', businessName: 'North Star Brands' },
      { id: 'PORT_PAGE_2', name: 'Locked Page', businessName: 'North Star Brands' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id, true)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBeNull();

    const selection = await verifyFacebookPagesSelectionToken(location.searchParams.get('token')!);
    expect(selection?.pages).toEqual([
      { id: 'PERSONAL_1', name: 'Personal Page', access_token: 'personal-tok' },
      { id: 'PORT_PAGE_1', name: 'Portfolio Page', access_token: 'port-tok-1', business: 'North Star Brands' },
    ]);
  });

  it('keeps the personal list when a portfolio-aware login cannot read the portfolios', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'PERSONAL_1', name: 'Personal Page', access_token: 'personal-tok' },
    ]);
    getPortfolioPagesMock.mockRejectedValue(new Error('graph unreachable'));

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id, true)}`,
      { redirect: 'manual' },
    );
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBeNull();
    const selection = await verifyFacebookPagesSelectionToken(location.searchParams.get('token')!);
    expect(selection?.pages.map((page) => page.id)).toEqual(['PERSONAL_1']);
  });

  it('does not reach for portfolios on a login that never asked for them', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([
      { id: 'PERSONAL_1', name: 'Personal Page', access_token: 'personal-tok' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    expect(getPortfolioPagesMock).not.toHaveBeenCalled();
  });

  it('redirects with a named reason when Facebook returns no pages at all', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain(`/b/${business.id}/channels/connect-facebook?error=no-pages-on-account`);
    expect(location).not.toContain('no-pages-selected');
  });

  it('offers portfolio pages in the picker when /me/accounts is empty but a portfolio has them', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);
    getPortfolioPagesMock.mockResolvedValue([
      { id: 'PORT_PAGE_1', name: 'Portfolio Page', accessToken: 'port-tok-1', businessName: 'North Star Brands' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBeNull();

    const selection = await verifyFacebookPagesSelectionToken(location.searchParams.get('token')!);
    expect(selection?.pages).toEqual([
      { id: 'PORT_PAGE_1', name: 'Portfolio Page', access_token: 'port-tok-1', business: 'North Star Brands' },
    ]);
  });

  it('names the portfolio pages it cannot control instead of claiming the user has none', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);
    getPortfolioPagesMock.mockResolvedValue([
      { id: 'PORT_PAGE_2', name: 'Locked Page', businessName: 'North Star Brands' },
    ]);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    const location = new URL(res.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('pages-not-controllable');
    expect(location.searchParams.get('detail')).toContain('Locked Page — North Star Brands');
  });

  it('says the permission was withheld when Facebook granted no page access at all', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);
    getGrantedPermissionsMock.mockResolvedValue(['public_profile', 'email']);

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.headers.get('location')).toContain('error=pages-permission-not-granted');
  });

  it('still redirects when the diagnosis calls themselves fail', async () => {
    const { user, business } = await seedTestWorld();
    exchangeCodeForTokenMock.mockResolvedValue('user-token');
    getUserPagesMock.mockResolvedValue([]);
    getGrantedPermissionsMock.mockRejectedValue(new Error('graph unreachable'));
    getPortfolioPagesMock.mockRejectedValue(new Error('graph unreachable'));

    const res = await app.request(
      `/api/v1/auth/facebook/callback?code=auth-code&state=${await stateFor(business.id, user.id)}`,
      { redirect: 'manual' },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=no-pages-on-account');
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

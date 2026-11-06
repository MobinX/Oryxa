import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';
import { updateChannel } from '@repo/db/crud/channel';

withPglite({ timeoutMs: 300_000 });

const originalFetch = globalThis.fetch;

/** Routes fake Graph answers by URL: ad accounts, then the three insights calls. */
function graphAnswers(answers: {
  accounts?: unknown;
  totals?: unknown;
  campaigns?: unknown;
  breakdown?: unknown;
}) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    const body = url.includes('/me/adaccounts')
      ? answers.accounts
      : url.includes('level=campaign')
        ? answers.campaigns
        : url.includes('breakdowns=')
          ? answers.breakdown
          : answers.totals;
    return new Response(JSON.stringify(body ?? { data: [] }), { status: 200 });
  }) as unknown as typeof fetch;
}

function graphUrls(): string[] {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

const ACCOUNTS = { data: [{ id: 'act_1', name: 'Shop ads' }, { id: 'act_2', name: 'Brand ads' }] };
const TOTALS = { data: [{ spend: '100.50', impressions: '10000', clicks: '250', reach: '8000' }] };
const CAMPAIGNS = {
  data: [
    { campaign_id: 'c1', campaign_name: 'Spring', spend: '60', impressions: '6000', clicks: '150', reach: '5000' },
    { campaign_id: 'c2', campaign_name: 'Clearance', spend: '40.50', impressions: '4000', clicks: '100', reach: '3000' },
  ],
};
const BREAKDOWN = {
  data: [{ age: '25-34', gender: 'female', spend: '70', impressions: '7000', clicks: '175' }],
};

describe('Ads overview', () => {
  beforeEach(() => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function seedWithAdsToken() {
    const { business, channel } = await seedTestWorld();
    await updateChannel(business.id, channel.id, { metaUserToken: 'ads-user-token' });
    return business;
  }

  it('returns normalized totals, campaigns and breakdown for the first ad account', async () => {
    const business = await seedWithAdsToken();
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(`/api/v1/${business.id}/ads/overview?days=30`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.connected).toBe(true);
    expect(body.account).toEqual({ id: 'act_1', name: 'Shop ads' });
    expect(body.accounts).toHaveLength(2);
    expect(body.totals.spend).toBe(100.5);
    expect(body.totals.impressions).toBe(10000);
    expect(body.totals.clicks).toBe(250);
    expect(body.totals.reach).toBe(8000);
    expect(body.totals.ctr).toBeCloseTo(2.5, 5);
    expect(body.totals.cpc).toBeCloseTo(0.402, 5);
    expect(body.totals.cpm).toBeCloseTo(10.05, 5);
    expect(body.campaigns.map((campaign: any) => campaign.name)).toEqual(['Spring', 'Clearance']);
    expect(body.byAgeGender).toEqual([
      { age: '25-34', gender: 'female', spend: 70, impressions: 7000, clicks: 175 },
    ]);
    // The read went out with the banked user token, against last_30d.
    const urls = graphUrls();
    expect(urls.some((url) => url.includes('ads-user-token'))).toBe(true);
    expect(urls.some((url) => url.includes('date_preset=last_30d'))).toBe(true);
  });

  it('reads the requested ad account when accountId names one', async () => {
    const business = await seedWithAdsToken();
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(`/api/v1/${business.id}/ads/overview?accountId=act_2`, {
      headers: authHeaders(),
    });
    const body = (await res.json()) as any;
    expect(body.connected).toBe(true);
    expect(body.account).toEqual({ id: 'act_2', name: 'Brand ads' });
    expect(graphUrls().some((url) => url.includes('/act_2/insights'))).toBe(true);
  });

  it('asks Meta for last_7d when days=7', async () => {
    const business = await seedWithAdsToken();
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(`/api/v1/${business.id}/ads/overview?days=7`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).connected).toBe(true);
    expect(graphUrls().some((url) => url.includes('date_preset=last_7d'))).toBe(true);
  });

  it('asks Meta for an explicit range when days=365', async () => {
    const business = await seedWithAdsToken();
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(`/api/v1/${business.id}/ads/overview?days=365`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).connected).toBe(true);
    const urls = graphUrls();
    expect(urls.some((url) => url.includes('time_range='))).toBe(true);
    expect(urls.some((url) => url.includes('date_preset='))).toBe(false);
  });

  it('rejects windows past two years', async () => {
    const business = await seedWithAdsToken();

    const res = await app.request(`/api/v1/${business.id}/ads/overview?days=731`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('falls back to the first ad account when accountId names nothing', async () => {
    const business = await seedWithAdsToken();
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(`/api/v1/${business.id}/ads/overview?accountId=act_nope`, {
      headers: authHeaders(),
    });
    const body = (await res.json()) as any;
    expect(body.connected).toBe(true);
    expect(body.account).toEqual({ id: 'act_1', name: 'Shop ads' });
  });

  it('reports unconnected, without calling Meta, when no channel banked an ads token', async () => {
    const { business } = await seedTestWorld();
    graphAnswers({});

    const res = await app.request(`/api/v1/${business.id}/ads/overview`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports unconnected with a reason when Meta refuses the read', async () => {
    const business = await seedWithAdsToken();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad token', code: 190 } }), { status: 400 }),
    ) as unknown as typeof fetch;

    const res = await app.request(`/api/v1/${business.id}/ads/overview`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.connected).toBe(false);
    expect(body.error).toContain('reconnect');
  });

  it('lists channels with their ads state, and leaks no token', async () => {
    const business = await seedWithAdsToken();

    const res = await app.request(`/api/v1/${business.id}/ads/channels`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain('ads-user-token');
    expect(raw).not.toContain('page-token-test');
    const body = JSON.parse(raw) as any;
    expect(body.channels).toHaveLength(1);
    expect(body.channels[0]).toMatchObject({ hasAds: true });
    expect(body.channels[0].id).toBeTruthy();
    expect(body.channels[0].pageName).toBeTruthy();
  });

  it('reads with the selected channel token', async () => {
    const business = await seedWithAdsToken();
    const { createChannel } = await import('@repo/db/crud/channel');
    const second = await createChannel(business.id, {
      platform: 'facebook',
      apiToken: 'page-token-2',
      platformChannelId: `PAGE_${crypto.randomUUID()}`,
      metaUserToken: 'ads-token-2',
    });
    graphAnswers({ accounts: ACCOUNTS, totals: TOTALS, campaigns: CAMPAIGNS, breakdown: BREAKDOWN });

    const res = await app.request(
      `/api/v1/${business.id}/ads/overview?channelId=${second.id}`,
      { headers: authHeaders() },
    );
    const body = (await res.json()) as any;
    expect(body.connected).toBe(true);
    expect(body.channel.id).toBe(second.id);
    expect(graphUrls().every((url) => url.includes('ads-token-2'))).toBe(true);
  });

  it('answers 404 for a channel of another business', async () => {
    const business = await seedWithAdsToken();
    const other = await seedTestWorld();
    graphAnswers({});

    const res = await app.request(
      `/api/v1/${business.id}/ads/overview?channelId=${other.channel.id}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(404);
  });

  it('names the reconnect for a channel connected without ad reporting', async () => {
    const { business, channel } = await seedTestWorld();
    graphAnswers({});

    const res = await app.request(
      `/api/v1/${business.id}/ads/overview?channelId=${channel.id}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.connected).toBe(false);
    expect(body.channel.id).toBe(channel.id);
    expect(body.error).toContain('reconnect');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

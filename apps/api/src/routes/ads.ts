import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { authMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';
import {
  getBusinessAdsSource,
  getChannelAdsToken,
  listAdsChannels,
  type AdsChannelOption,
} from '@repo/db/crud/channel';
import {
  getAdAccounts,
  getAdsAgeGender,
  getAdsCampaigns,
  getAdsTotals,
} from '@repo/integrations/facebook';

export const adsRouter = new OpenAPIHono();

adsRouter.use('/:businessId/*', authMiddleware, businessAccessMiddleware);

const adsMetricsSchema = z.object({
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  reach: z.number(),
});

const adsOverviewSchema = z.object({
  connected: z.boolean(),
  /** Set when Meta refused the read: the page shows it beside the reconnect hint. */
  error: z.string().optional(),
  days: z.number().optional(),
  channel: z.object({ id: z.string(), pageName: z.string() }).optional(),
  accounts: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  account: z.object({ id: z.string(), name: z.string() }).optional(),
  totals: adsMetricsSchema
    .extend({ ctr: z.number(), cpc: z.number(), cpm: z.number() })
    .optional(),
  campaigns: z
    .array(
      adsMetricsSchema.extend({
        id: z.string(),
        name: z.string(),
        ctr: z.number(),
        cpc: z.number(),
        cpm: z.number(),
      }),
    )
    .optional(),
  byAgeGender: z
    .array(
      z.object({
        age: z.string(),
        gender: z.string(),
        spend: z.number(),
        impressions: z.number(),
        clicks: z.number(),
      }),
    )
    .optional(),
});

const adsOverviewRoute = createRoute({
  method: 'get',
  path: '/{businessId}/ads/overview',
  tags: ['Ads'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
    query: z.object({
      days: z.coerce.number().int().min(1).max(730).optional().default(30),
      accountId: z.string().min(1).max(64).optional(),
      channelId: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: adsOverviewSchema } },
      description: 'Ad reporting for the business, or why it is unavailable',
    },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Unknown channel' },
  },
});

const adsChannelsRoute = createRoute({
  method: 'get',
  path: '/{businessId}/ads/channels',
  tags: ['Ads'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ businessId: z.string().uuid() }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            channels: z.array(
              z.object({
                id: z.string(),
                pageName: z.string(),
                platformChannelId: z.string(),
                hasAds: z.boolean(),
              }),
            ),
          }),
        },
      },
      description: 'Facebook channels that can feed the Ads page',
    },
  },
});

adsRouter.openapi(adsChannelsRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const channels = await listAdsChannels(businessId);
  return c.json({ channels }, 200);
});

function withRates(row: { spend: number; impressions: number; clicks: number }) {
  const { spend, impressions, clicks } = row;
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

adsRouter.openapi(adsOverviewRoute, async (c) => {
  const businessId = c.req.param('businessId');
  const { days, accountId, channelId } = c.req.valid('query');

  // A lookup failure (a deployment whose database predates the token column, a
  // blip) must read as unavailable reporting, not as a broken page.
  let source: { token: string; channel: AdsChannelOption } | null = null;
  try {
    if (channelId) {
      const selected = (await listAdsChannels(businessId)).find((o) => o.id === channelId);
      if (!selected) return c.json({ error: 'Channel not found' }, 404);
      const token = selected.hasAds ? await getChannelAdsToken(businessId, channelId) : null;
      if (!token) {
        return c.json(
          {
            connected: false as const,
            channel: { id: selected.id, pageName: selected.pageName },
            error: 'This channel was connected without ad reporting — reconnect it with ad reporting checked.',
          },
          200,
        );
      }
      source = { token, channel: selected };
    } else {
      source = await getBusinessAdsSource(businessId);
      if (!source) return c.json({ connected: false as const }, 200);
    }
  } catch (err) {
    console.error('[ads] token lookup failed', {
      businessId,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        connected: false as const,
        error: 'Ad reporting is temporarily unavailable — try again soon.',
      },
      200,
    );
  }
  if (!source) return c.json({ connected: false as const }, 200);
  const { token, channel } = source;

  try {
    const accounts = await getAdAccounts(token);
    if (accounts.length === 0) {
      return c.json(
        {
          connected: false as const,
          error: 'No ad accounts on this login — connect with an account that runs ads.',
        },
        200,
      );
    }
    const account = (accountId && accounts.find((a) => a.id === accountId)) || accounts[0]!;
    const [totals, campaigns, byAgeGender] = await Promise.all([
      getAdsTotals(account.id, token, days),
      getAdsCampaigns(account.id, token, days),
      getAdsAgeGender(account.id, token, days),
    ]);
    return c.json(
      {
        connected: true as const,
        days,
        channel: { id: channel.id, pageName: channel.pageName },
        accounts,
        account: { id: account.id, name: account.name },
        totals: { ...totals, ...withRates(totals) },
        campaigns: campaigns.map((row) => ({ ...row, ...withRates(row) })),
        byAgeGender,
      },
      200,
    );
  } catch (err) {
    // Never the token: the message is what the page shows, the log is what we debug with.
    console.error('[ads] Meta read failed', {
      businessId,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        connected: false as const,
        error: 'Meta refused the ad read — reconnect Facebook to grant ad access.',
      },
      200,
    );
  }
});

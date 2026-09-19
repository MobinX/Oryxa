import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { recordTokenUsage, getBusinessTokenAnalytics, listTokenLogs } from '@repo/db/crud/token-analytics';

describe('Token Analytics CRUD', () => {
  withPglite();

  it('records token usage and updates hourly analytics rollups', async () => {
    const seed = await seedTestWorld();

    const log = await recordTokenUsage({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      conversationId: seed.conversation.id,
      integrationType: 'facebook_messenger',
      provider: 'openai',
      model: 'gpt-5-mini',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheHitTokens: 20,
      cacheMissTokens: 80,
      cacheHitPercent: 20.0,
      latencyMs: 350,
      estimatedCostUsd: 0.000045,
    });

    expect(log).toBeDefined();
    expect(log.businessId).toBe(seed.business.id);
    expect(log.totalTokens).toBe(150);

    const analytics = await getBusinessTokenAnalytics(seed.business.id, 24);
    expect(analytics.totals.totalTokens).toBe(150);
    expect(analytics.totals.totalInputTokens).toBe(100);
    expect(analytics.totals.totalOutputTokens).toBe(50);
    expect(analytics.totals.totalCacheHitTokens).toBe(20);
    expect(analytics.totals.totalCacheMissTokens).toBe(80);
    expect(analytics.totals.totalRuns).toBe(1);
    expect(analytics.totals.avgTokensPerMessage).toBe(150);

    expect(analytics.byIntegration.length).toBeGreaterThan(0);
    expect(analytics.byIntegration[0].integrationType).toBe('facebook_messenger');

    const logs = await listTokenLogs(seed.business.id, 10);
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe(log.id);
  });

  it('aggregates multiple runs across different integrations', async () => {
    const seed = await seedTestWorld();

    await recordTokenUsage({
      businessId: seed.business.id,
      integrationType: 'facebook_messenger',
      provider: 'openai',
      model: 'gpt-5-mini',
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cacheHitTokens: 50,
      cacheMissTokens: 150,
      cacheHitPercent: 25.0,
      latencyMs: 400,
      estimatedCostUsd: 0.000090,
    });

    await recordTokenUsage({
      businessId: seed.business.id,
      integrationType: 'facebook_comment',
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheHitTokens: 10,
      cacheMissTokens: 90,
      cacheHitPercent: 10.0,
      latencyMs: 250,
      estimatedCostUsd: 0.000022,
    });

    const analytics = await getBusinessTokenAnalytics(seed.business.id, 24);
    expect(analytics.totals.totalTokens).toBe(450);
    expect(analytics.totals.totalRuns).toBe(2);
    expect(analytics.totals.avgTokensPerMessage).toBe(225);
    expect(analytics.byIntegration.length).toBe(2);
  });
});

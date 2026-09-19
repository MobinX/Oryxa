import { it, expect } from 'vitest';
import { seedTestWorld } from '../../helpers/seed';
import { recordTokenUsage, getBusinessTokenAnalytics, listTokenLogs } from '@repo/db/crud/token-analytics';

export function registerTokenAnalyticsCrudTests() {
  it('records token usage and updates hourly rollups', async () => {
    const seed = await seedTestWorld();

    const log = await recordTokenUsage({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      conversationId: seed.conversation.id,
      integrationType: 'facebook_messenger',
      provider: 'openai',
      model: 'gpt-5-mini',
      inputTokens: 150,
      outputTokens: 50,
      totalTokens: 200,
      cacheHitTokens: 30,
      cacheMissTokens: 120,
      cacheHitPercent: 20.0,
      latencyMs: 320,
      estimatedCostUsd: 0.000055,
    });

    expect(log).toBeDefined();
    expect(log.totalTokens).toBe(200);

    const analytics = await getBusinessTokenAnalytics(seed.business.id, 24);
    expect(analytics.totals.totalTokens).toBe(200);
    expect(analytics.totals.totalInputTokens).toBe(150);
    expect(analytics.totals.totalOutputTokens).toBe(50);
    expect(analytics.totals.totalRuns).toBe(1);

    const logs = await listTokenLogs(seed.business.id, 10);
    expect(logs.length).toBeGreaterThan(0);
  });
}

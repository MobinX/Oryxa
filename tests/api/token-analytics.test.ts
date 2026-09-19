import { describe, it, expect } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { recordTokenUsage } from '@repo/db/crud/token-analytics';
import { app } from '@api/app';

describe('Token Analytics API', () => {
  withPglite();

  it('GET /api/v1/:businessId/analytics/tokens returns token analytics summary', async () => {
    const seed = await seedTestWorld();

    await recordTokenUsage({
      businessId: seed.business.id,
      channelId: seed.channel.id,
      integrationType: 'facebook_messenger',
      provider: 'openai',
      model: 'gpt-5-mini',
      inputTokens: 500,
      outputTokens: 100,
      totalTokens: 600,
      cacheHitTokens: 100,
      cacheMissTokens: 400,
      cacheHitPercent: 20.0,
      latencyMs: 300,
      estimatedCostUsd: 0.000135,
    });

    const res = await app.request(`/api/v1/${seed.business.id}/analytics/tokens?hours=24`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals).toBeDefined();
    expect(data.totals.totalTokens).toBe(600);
    expect(data.totals.totalInputTokens).toBe(500);
    expect(data.totals.totalOutputTokens).toBe(100);
    expect(data.totals.totalCacheHitTokens).toBe(100);
    expect(data.totals.overallCacheHitPercent).toBe(20);

    expect(data.byIntegration.length).toBeGreaterThan(0);
    expect(data.hourlyGraphData.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/:businessId/analytics/tokens/logs lists recent log events', async () => {
    const seed = await seedTestWorld();

    await recordTokenUsage({
      businessId: seed.business.id,
      integrationType: 'ai_post_generation',
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      inputTokens: 300,
      outputTokens: 80,
      totalTokens: 380,
      cacheHitTokens: 0,
      cacheMissTokens: 300,
      cacheHitPercent: 0,
      latencyMs: 500,
      estimatedCostUsd: 0.000046,
    });

    const res = await app.request(`/api/v1/${seed.business.id}/analytics/tokens/logs?limit=10`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const logs = await res.json();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(1);
    expect(logs[0].integrationType).toBe('ai_post_generation');
  });
});

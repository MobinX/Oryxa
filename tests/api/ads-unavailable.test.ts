import { describe, it, expect, vi, afterEach } from 'vitest';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { app } from '@api/app';

vi.mock('@repo/db/crud/channel', async () => {
  const actual = await import('../../packages/db/crud/channel');
  return {
    ...actual,
    getBusinessAdsSource: async () => {
      throw new Error('column "channels.meta_user_token" does not exist');
    },
  };
});

withPglite({ timeoutMs: 300_000 });

const originalFetch = globalThis.fetch;

describe('Ads overview without the token column', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports temporarily unavailable instead of failing the page', async () => {
    const { business } = await seedTestWorld();

    const res = await app.request(`/api/v1/${business.id}/ads/overview`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.connected).toBe(false);
    expect(body.error).toContain('temporarily unavailable');
  });
});

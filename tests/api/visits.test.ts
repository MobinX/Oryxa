import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withPglite } from '../helpers/with-pglite';
import { app } from '@api/index';
import { db } from '@db/client';
import { visits } from '@db/schema';
import { syncUser } from '@repo/db/crud/user';
import { createBusiness, updateBusiness } from '@repo/db/crud/business';
import { flushBackground } from '@api/lib/background';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function makeStore(slug: string, published: boolean) {
  const user = await syncUser({
    firebaseUid: `visits-${slug}-${Date.now()}`,
    name: 'Owner',
    signInMethod: 'google',
  });
  const biz = await createBusiness(user.id, { name: 'Book Nook' });
  await updateBusiness(biz.id, user.id, { slug, storePublished: published });
  return biz;
}

function post(slug: string, body: unknown) {
  return app.request('/api/v1/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rows(businessId: string) {
  return db.select().from(visits).where(eq(visits.businessId, businessId));
}

describe('POST /api/v1/visits', () => {
  // Migrations on this box sometimes exceed vitest's 30 s hook default.
  withPglite({ timeoutMs: 120_000 });

  it('counts a page view of a published store and stores no raw id', async () => {
    const biz = await makeStore('visits-a', true);
    const res = await post('visits-a', { slug: 'visits-a', path: '/store/visits-a', visitor: ID });
    expect(res.status).toBe(204);
    await flushBackground();

    const seen = await rows(biz.id);
    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe('/store/visits-a');
    // A sha256 hex digest, and nothing recoverable about the browser that sent it.
    expect(seen[0].visitor).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[0].visitor).not.toContain(ID);
  });

  it('dedupes the same visitor in the same store on the same day', async () => {
    const biz = await makeStore('visits-b', true);
    for (const path of ['/store/visits-b', '/store/visits-b/p-1', '/store/visits-b/checkout']) {
      await post('visits-b', { slug: 'visits-b', path, visitor: ID });
    }
    await flushBackground();
    expect(await rows(biz.id)).toHaveLength(1);
  });

  it('counts different visitors separately, and an anonymous hit once', async () => {
    const biz = await makeStore('visits-c', true);
    await post('visits-c', { slug: 'visits-c', path: '/store/visits-c', visitor: ID });
    await post('visits-c', { slug: 'visits-c', path: '/store/visits-c', visitor: OTHER });
    for (let i = 0; i < 3; i++) await post('visits-c', { slug: 'visits-c', path: '/store/visits-c' });
    await flushBackground();

    const seen = await rows(biz.id);
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((row) => row.visitor)).size).toBe(3);
  });

  it('writes nothing for an unknown or unpublished slug', async () => {
    const biz = await makeStore('visits-d', false);

    expect((await post('visits-d', { slug: 'visits-d', path: '/store/visits-d' })).status).toBe(404);
    expect((await post('nope', { slug: 'nope', path: '/store/nope' })).status).toBe(404);
    await flushBackground();
    expect(await rows(biz.id)).toHaveLength(0);
  });

  it('rejects a path that is not a storefront page before writing', async () => {
    const biz = await makeStore('visits-e', true);
    const res = await post('visits-e', { slug: 'visits-e', path: '/businesses/1' });
    expect(res.status).toBe(400);
    await flushBackground();
    expect(await rows(biz.id)).toHaveLength(0);
  });

  it('rejects a malformed body', async () => {
    expect((await post('visits-a', { slug: '', path: '/store/visits-a' })).status).toBe(400);
    expect((await post('visits-a', { slug: 'visits-a' })).status).toBe(400);
  });

  it('rejects an over-long visitor id rather than truncating it', async () => {
    const biz = await makeStore('visits-f', true);
    const res = await post('visits-f', {
      slug: 'visits-f',
      path: '/store/visits-f',
      visitor: 'x'.repeat(65),
    });
    expect(res.status).toBe(400);
    await flushBackground();
    expect(await rows(biz.id)).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld, authHeaders } from '../helpers/seed';
import { authMiddleware, optionalAuthMiddleware } from '@api/middleware/auth';
import { businessAccessMiddleware } from '@api/middleware/business';

describe('Auth Middleware', () => {
  withPglite();

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  it('returns 401 without Authorization header', async () => {
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected');
    expect(res.status).toBe(401);
  });

  it('allows dev-test-token when user exists', async () => {
    await seedTestWorld();
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ userId: c.get('user').id }));

    const res = await app.request('/protected', { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect((await res.json()).userId).toBeDefined();
  });

  it('returns 401 for invalid bearer format', async () => {
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected', { headers: { Authorization: 'Token abc' } });
    expect(res.status).toBe(401);
  });

  it('returns 503 when Firebase is unavailable in production', async () => {
    process.env.NODE_ENV = 'production';

    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected', { headers: { Authorization: 'Bearer real-token' } });
    expect(res.status).toBe(503);
    process.env.NODE_ENV = 'test';
  });

  it('optionalAuthMiddleware skips auth when header is absent', async () => {
    const app = new Hono();
    app.use('*', optionalAuthMiddleware);
    app.get('/public', (c) => c.json({ ok: true }));

    const res = await app.request('/public');
    expect(res.status).toBe(200);
  });
});

describe('Business Access Middleware', () => {
  withPglite();

  it('returns 403 when user does not own business', async () => {
    const seed = await seedTestWorld();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', {
        id: '00000000-0000-0000-0000-000000000001',
        firebaseUid: 'fake',
        name: 'Fake',
      });
      return next();
    });
    app.get('/:businessId', businessAccessMiddleware, (c) => c.json({ ok: true }));

    const res = await app.request(`/${seed.business.id}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when businessId or user is missing', async () => {
    const app = new Hono();
    app.get('/:businessId', businessAccessMiddleware, (c) => c.json({ ok: true }));

    const res = await app.request('/biz-id');
    expect(res.status).toBe(403);
  });

  it('allows owner access', async () => {
    const seed = await seedTestWorld();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', {
        id: seed.user.id,
        firebaseUid: seed.user.firebaseUid,
        name: seed.user.name,
      });
      return next();
    });
    app.get('/:businessId', businessAccessMiddleware, (c) => c.json({ ok: true }));

    const res = await app.request(`/${seed.business.id}`);
    expect(res.status).toBe(200);
  });
});

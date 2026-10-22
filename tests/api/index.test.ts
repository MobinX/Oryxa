import { describe, it, expect, afterEach } from 'vitest';
import { app } from '@api/app';

const saved = { NODE_ENV: process.env.NODE_ENV, ENABLE_API_DOCS: process.env.ENABLE_API_DOCS };

afterEach(() => {
  process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.ENABLE_API_DOCS === undefined) delete process.env.ENABLE_API_DOCS;
  else process.env.ENABLE_API_DOCS = saved.ENABLE_API_DOCS;
});

describe('API root', () => {
  it('GET / returns service info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Oryxa API');
    expect(body.version).toBe('1.0.0');
  });

  it('GET /doc returns OpenAPI spec', async () => {
    const res = await app.request('/doc');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.0.0');
    expect(body.info.title).toBe('Oryxa API');
  });

  it('does not serve the OpenAPI contract in production unless explicitly enabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_API_DOCS;

    expect((await app.request('/doc')).status).toBe(404);
    expect((await app.request('/ui')).status).toBe(404);

    process.env.ENABLE_API_DOCS = 'true';
    expect((await app.request('/doc')).status).toBe(200);
  });

  it('OPTIONS preflight is handled by CORS middleware', async () => {
    const res = await app.request('/api/v1/users/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3400',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3400');
  });
});

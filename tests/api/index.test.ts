import { describe, it, expect } from 'vitest';
import { app } from '@api/app';

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

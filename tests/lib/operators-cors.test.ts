import { describe, it, expect, afterEach } from 'vitest';
import { isOperatorEmail } from '@api/lib/operators';
import { allowedOrigin } from '@api/lib/cors-origins';
import { app } from '@api/app';

const saved = { ...process.env };
afterEach(() => {
  for (const k of ['ADMIN_EMAILS', 'CORS_ORIGINS', 'WEB_URL', 'NODE_ENV']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isOperatorEmail', () => {
  it('rejects a substring of a listed address', () => {
    process.env.ADMIN_EMAILS = 'oracle@x.com, boss@y.com';
    expect(isOperatorEmail('racle@x.com')).toBe(false);
    expect(isOperatorEmail('cle@x.com')).toBe(false);
    expect(isOperatorEmail('')).toBe(false);
    expect(isOperatorEmail(null)).toBe(false);
  });
  it('matches exactly, case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'oracle@x.com, boss@y.com';
    expect(isOperatorEmail(' Boss@Y.com ')).toBe(true);
  });
  it('admin123@oryxa.app is not a default operator any more — only ADMIN_EMAILS admits it', () => {
    process.env.ADMIN_EMAILS = 'boss@y.com';
    expect(isOperatorEmail('admin123@oryxa.app')).toBe(false);
    delete process.env.ADMIN_EMAILS;
    // Even with no allowlist configured the historical password-shaped
    // identity must stay outside; only the owner's own address is built in.
    expect(isOperatorEmail('admin123@oryxa.app')).toBe(false);
  });
});

describe('CORS allowlist', () => {
  it('does not reflect an arbitrary origin', () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_URL = 'https://app.example.com';
    expect(allowedOrigin('https://evil.example.net')).toBeNull();
    expect(allowedOrigin('http://localhost:3400')).toBeNull();
    expect(allowedOrigin('https://app.example.com')).toBe('https://app.example.com');
  });
  it('allows CORS_ORIGINS entries and localhost outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = 'https://shop.example.org, https://x.example.org';
    expect(allowedOrigin('https://x.example.org')).toBe('https://x.example.org');
    expect(allowedOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });
  it('sends no Access-Control-Allow-Origin to a hostile origin on the real app', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_URL = 'https://app.example.com';
    const evil = await app.request('/', { headers: { Origin: 'https://evil.example.net' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const good = await app.request('/', { headers: { Origin: 'https://app.example.com' } });
    expect(good.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });
});

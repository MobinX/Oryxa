import { describe, it, expect } from 'vitest';
import {
  allowedFromDomains,
  isFromDomainAllowed,
  isRetryableSendError,
  isRetryableStatus,
  maxSendAttempts,
  providerFallbackOrder,
  retryDelayMs,
  sendAttemptTimeoutMs,
} from '../../apps/mail/src/lib/send-policy';

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    DB: null,
    B2_KEY_ID: '',
    B2_APPLICATION_KEY: '',
    B2_BUCKET_NAME: '',
    B2_ENDPOINT: '',
    B2_REGION: '',
    MAIL_API_KEY: 'test',
    DEFAULT_FROM_EMAIL: 'noreply@onlyorders.tech',
    DEFAULT_FROM_NAME: 'OnlyOrders',
    ...overrides,
  } as unknown as Parameters<typeof providerFallbackOrder>[0];
}

describe('mail send policy (apps/mail/src/lib/send-policy.ts)', () => {
  it('classifies retryable HTTP statuses', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(425)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    expect(retryDelayMs(1)).toBe(500);
    expect(retryDelayMs(2)).toBe(1000);
    expect(retryDelayMs(3)).toBe(2000);
    expect(retryDelayMs(10)).toBe(8000);
    expect(retryDelayMs(0)).toBe(500);
  });

  it('parses timeout and attempt budgets with clamps', () => {
    expect(sendAttemptTimeoutMs(env({}))).toBe(30_000);
    expect(sendAttemptTimeoutMs(env({ MAIL_SEND_TIMEOUT_MS: '10000' }))).toBe(10_000);
    expect(sendAttemptTimeoutMs(env({ MAIL_SEND_TIMEOUT_MS: '1' }))).toBe(5_000);
    expect(sendAttemptTimeoutMs(env({ MAIL_SEND_TIMEOUT_MS: '999999' }))).toBe(60_000);
    expect(maxSendAttempts(env({}))).toBe(3);
    expect(maxSendAttempts(env({ MAIL_SEND_MAX_ATTEMPTS: '1' }))).toBe(1);
    expect(maxSendAttempts(env({ MAIL_SEND_MAX_ATTEMPTS: '99' }))).toBe(5);
    expect(maxSendAttempts(env({ MAIL_SEND_MAX_ATTEMPTS: 'nope' }))).toBe(3);
  });

  it('orders providers Brevo-first with real fallback', () => {
    expect(providerFallbackOrder(env({ BREVO_API_KEY: 'b', SENDER_API_KEY: 's' }))).toEqual([
      'brevo',
      'sender.net',
    ]);
    expect(providerFallbackOrder(env({ BREVO_API_KEY: 'b' }))).toEqual(['brevo']);
    expect(providerFallbackOrder(env({ SENDER_API_KEY: 's' }))).toEqual(['sender.net']);
    expect(providerFallbackOrder(env({}))).toEqual([]);
  });

  it('keeps a forced provider strict', () => {
    expect(
      providerFallbackOrder(env({ MAIL_SEND_PROVIDER: 'brevo', BREVO_API_KEY: 'b', SENDER_API_KEY: 's' })),
    ).toEqual(['brevo']);
    expect(providerFallbackOrder(env({ MAIL_SEND_PROVIDER: 'sender.net', BREVO_API_KEY: 'b' }))).toEqual([]);
    expect(providerFallbackOrder(env({ MAIL_SEND_PROVIDER: 'brevo' }))).toEqual([]);
  });

  it('retries transport errors and 5xx/429, never 4xx validation failures', () => {
    expect(isRetryableSendError({ code: 'brevo_unreachable', message: 'x' })).toBe(true);
    expect(isRetryableSendError({ code: 'sender_unreachable', message: 'x' })).toBe(true);
    expect(
      isRetryableSendError({ code: 'brevo_error', message: 'x', details: { status: 503 } }),
    ).toBe(true);
    expect(
      isRetryableSendError({ code: 'brevo_error', message: 'x', details: { status: 429 } }),
    ).toBe(true);
    expect(
      isRetryableSendError({ code: 'brevo_error', message: 'bad', details: { status: 400 } }),
    ).toBe(false);
    expect(
      isRetryableSendError({ code: 'sender_error', message: 'bad', details: { status: 422 } }),
    ).toBe(false);
    expect(isRetryableSendError({ code: 'provider_not_configured', message: 'x' })).toBe(false);
    expect(isRetryableSendError({ code: 'brevo_error', message: 'x' })).toBe(false);
    expect(isRetryableSendError(new Error('boom'))).toBe(false);
    expect(isRetryableSendError(null)).toBe(false);
  });

  it('parses the from-domain allowlist', () => {
    expect(allowedFromDomains(env({}))).toBeNull();
    expect(allowedFromDomains(env({ ALLOWED_FROM_DOMAINS: '  ' }))).toBeNull();
    expect(allowedFromDomains(env({ ALLOWED_FROM_DOMAINS: 'onlyorders.tech, Example.COM' }))).toEqual([
      'onlyorders.tech',
      'example.com',
    ]);
  });

  it('matches subdomains but not lookalikes', () => {
    const allowed = ['onlyorders.tech'];
    expect(isFromDomainAllowed('noreply@onlyorders.tech', allowed)).toBe(true);
    expect(isFromDomainAllowed('a@mail.onlyorders.tech', allowed)).toBe(true);
    expect(isFromDomainAllowed('a@evilonlyorders.tech', allowed)).toBe(false);
    expect(isFromDomainAllowed('a@onlyorders.tech.evil.com', allowed)).toBe(false);
    expect(isFromDomainAllowed('anything@gmail.com', null)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  scoreInboundSpam,
  spamThresholdFromEnv,
  DEFAULT_SPAM_THRESHOLD,
  type SpamInput,
} from '../../apps/mail/src/lib/spam';

function baseInput(overrides: Partial<SpamInput> = {}): SpamInput {
  return {
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: 'inbox@onlyorders.tech', name: '' }],
    subject: 'Order #1234 confirmation',
    text: 'Hi, your order has shipped. Track it in your account.',
    html: '<p>Hi, your order has shipped.</p>',
    headers: [{ key: 'subject', value: 'Order #1234 confirmation' }],
    attachments: [],
    messageId: '<abc123@example.com>',
    ...overrides,
  };
}

describe('spamThresholdFromEnv', () => {
  it('defaults to 5', () => {
    expect(spamThresholdFromEnv(undefined)).toBe(DEFAULT_SPAM_THRESHOLD);
    expect(spamThresholdFromEnv('')).toBe(DEFAULT_SPAM_THRESHOLD);
    expect(spamThresholdFromEnv('nope')).toBe(DEFAULT_SPAM_THRESHOLD);
  });

  it('clamps to 1..10', () => {
    expect(spamThresholdFromEnv('3')).toBe(3);
    expect(spamThresholdFromEnv('0')).toBe(1);
    expect(spamThresholdFromEnv('99')).toBe(10);
  });
});

describe('scoreInboundSpam (apps/mail/src/lib/spam.ts)', () => {
  it('scores ordinary ham near zero', () => {
    const verdict = scoreInboundSpam(baseInput());
    expect(verdict.isSpam).toBe(false);
    expect(verdict.score).toBeLessThanOrEqual(1);
  });

  it('flags a classic lottery phish as spam', () => {
    const verdict = scoreInboundSpam(
      baseInput({
        from: { email: 'claims@random-mail.xyz', name: 'PayPal Security' },
        replyTo: [{ email: 'collect@other-domain.ru', name: '' }],
        subject: 'URGENT: You are a LOTTERY WINNER!!! Act now',
        text: 'Congratulations winner! Verify your account to claim your prize. Wire transfer ready.',
        html: '<p>Congratulations winner! <a href="http://192.0.2.10/claim">https://paypal.com/claim</a></p>',
        messageId: null,
      }),
    );
    expect(verdict.isSpam).toBe(true);
    expect(verdict.score).toBeGreaterThanOrEqual(5);
    expect(verdict.reasons).toContain('replyto_mismatch');
    expect(verdict.reasons).toContain('from_display_spoof');
    expect(verdict.reasons).toContain('subject_spam_words');
  });

  it('treats thread replies as strong ham', () => {
    const verdict = scoreInboundSpam(
      baseInput({
        subject: 'Re: invoice question!!!',
        inReplyTo: '<original@example.com>',
        references: ['<original@example.com>'],
      }),
    );
    expect(verdict.isSpam).toBe(false);
    expect(verdict.reasons).toContain('in_thread:-3');
  });

  it('penalises risky attachments and double extensions', () => {
    const exe = scoreInboundSpam(
      baseInput({
        attachments: [{ filename: 'invoice.pdf.exe', contentType: 'application/octet-stream', size: 12 }],
      }),
    );
    expect(exe.reasons).toContain('risky_attachment');
    expect(exe.score).toBeGreaterThanOrEqual(3);

    const archive = scoreInboundSpam(
      baseInput({
        attachments: [{ filename: 'docs.zip', contentType: 'application/zip', size: 12 }],
      }),
    );
    expect(archive.reasons).toContain('archive_attachment');
    expect(archive.isSpam).toBe(false);
  });

  it('penalises auth failures and password forms', () => {
    const verdict = scoreInboundSpam(
      baseInput({
        headers: [
          { key: 'authentication-results', value: 'mx.example.com; dkim=fail; dmarc=fail' },
        ],
        html: '<form action="http://evil.example/collect"><input type="password" name="p"></form>',
      }),
    );
    expect(verdict.reasons).toContain('auth_fail');
    expect(verdict.reasons).toContain('html_password_form');
    expect(verdict.isSpam).toBe(true);
  });

  it('trusts legitimate list mail less suspiciously', () => {
    const plain = scoreInboundSpam(
      baseInput({ headers: [{ key: 'precedence', value: 'bulk' }] }),
    );
    const listed = scoreInboundSpam(
      baseInput({
        headers: [
          { key: 'precedence', value: 'bulk' },
          { key: 'list-unsubscribe', value: '<mailto:unsub@example.com>' },
        ],
      }),
    );
    expect(plain.reasons).toContain('bulk_precedence');
    expect(listed.score).toBeLessThan(plain.score);
    expect(listed.isSpam).toBe(false);
  });

  it('flags link-heavy and shortener bodies', () => {
    const links = Array.from({ length: 7 }, (_, i) => `https://bit.ly/x${i}`).join(' ');
    const verdict = scoreInboundSpam(baseInput({ text: `deal ${links}`, html: '' }));
    expect(verdict.reasons).toContain('link_heavy');
    expect(verdict.reasons).toContain('shortener_or_ip_url');
  });

  it('honours a custom threshold', () => {
    const input = baseInput({
      subject: 'You are a winner',
      messageId: null,
    });
    const strict = scoreInboundSpam(input, 1);
    const lenient = scoreInboundSpam(input, 10);
    expect(strict.threshold).toBe(1);
    expect(lenient.threshold).toBe(10);
    expect(strict.isSpam).toBe(true);
    expect(lenient.isSpam).toBe(false);
  });

  it('clamps scores to 0..10', () => {
    const kitchen = scoreInboundSpam(
      baseInput({
        from: { email: 'a@b.ru', name: 'Apple Support' },
        replyTo: [{ email: 'x@y.cn', name: '' }],
        subject: 'WINNER lottery inheritance act now!!!',
        text: 'verify your account, wire transfer, password expired http://10.0.0.1/x https://bit.ly/z',
        html: '<form><input type="password"></form><img src="http://10.0.0.1/p.gif">',
        headers: [{ key: 'authentication-results', value: 'dmarc=fail' }],
        attachments: [{ filename: 'run.exe', contentType: 'application/octet-stream', size: 1 }],
        messageId: null,
      }),
    );
    expect(kitchen.score).toBeLessThanOrEqual(10);
    const hammy = scoreInboundSpam(
      baseInput({
        inReplyTo: '<a@b>',
        headers: [{ key: 'list-unsubscribe', value: '<mailto:u@x>' }],
      }),
    );
    expect(hammy.score).toBeGreaterThanOrEqual(0);
  });
});

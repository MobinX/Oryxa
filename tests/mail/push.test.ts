import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildFcmMessage,
  resolveExpiry,
  signServiceAccountJwt,
} from '../../apps/mail/src/lib/push';
import type { Env } from '../../apps/mail/src/types';

function serviceAccountKey(): { privateKey: string; publicKey: ReturnType<typeof createPublicKey> } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })),
  };
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('mail push', () => {
  it('signs an RS256 service-account JWT that verifies with the public key', async () => {
    const { privateKey, publicKey } = serviceAccountKey();
    const env = {
      FIREBASE_PROJECT_ID: 'demo-project',
      FIREBASE_CLIENT_EMAIL: 'mail-push@demo-project.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: privateKey,
    } as unknown as Env;

    const jwt = await signServiceAccountJwt(env);
    expect(jwt).toBeTruthy();
    const [header, claims, signature] = (jwt as string).split('.');
    expect(header && claims && signature).toBeTruthy();

    expect(decodeSegment(header!)).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    expect(decodeSegment(claims!)).toMatchObject({
      iss: 'mail-push@demo-project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });

    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${claims}`),
      publicKey,
      Buffer.from(signature!, 'base64url'),
    );
    expect(valid).toBe(true);
  });

  it('builds a data + notification payload the web worker and app can both open', () => {
    const body = buildFcmMessage({
      token: 'token-123',
      title: 'New mail from Alice',
      body: 'Invoice for March',
      link: '/mails/email-1',
      data: { emailId: 'email-1', mailboxId: 'mailbox-1' },
    }) as {
      message: {
        token: string;
        notification: { title: string; body: string };
        data: Record<string, string>;
        android: { notification: { channelId: string; icon: string } };
      };
    };

    expect(body.message.token).toBe('token-123');
    expect(body.message.notification).toEqual({
      title: 'New mail from Alice',
      body: 'Invoice for March',
    });
    expect(body.message.data).toMatchObject({
      title: 'New mail from Alice',
      body: 'Invoice for March',
      link: '/mails/email-1',
      kind: 'mail',
      emailId: 'email-1',
      mailboxId: 'mailbox-1',
    });
    expect(body.message.android.notification.channelId).toBe('high_importance_channel');
    expect(body.message.android.notification.icon).toBe('ic_notification');
  });

  it('never issues a subscription past the configured cap', () => {
    const env = { MAIL_PUSH_MAX_TTL_SECONDS: '3600' } as unknown as Env;
    const requested = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const expiry = Date.parse(resolveExpiry(env, requested));
    expect(expiry).toBeLessThanOrEqual(Date.now() + 3600 * 1000 + 1_000);
    expect(expiry).toBeGreaterThan(Date.now());
  });

  it('falls back to a twelve-hour default without an explicit expiry', () => {
    const env = {} as unknown as Env;
    const expiry = Date.parse(resolveExpiry(env, undefined));
    expect(expiry).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 12 * 60 * 60 * 1000 + 1_000);
  });
});

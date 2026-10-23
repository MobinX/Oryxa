import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Context, Next } from 'hono';
import { getUserByFirebaseUid } from '@repo/db/crud/user';
import { emit } from '@api/lib/log';

let firebaseApp: App | undefined;

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    firebaseApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn('Firebase Admin not configured — auth middleware will use dev bypass');
  }

  return firebaseApp;
}

export type AuthUser = {
  id: string;
  firebaseUid: string;
  name: string;
  email?: string | null;
};

/** What the ID token itself says, independent of whether a `users` row exists yet. */
export type AuthIdentity = {
  firebaseUid: string;
  email?: string | null;
  name?: string | null;
};

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
    authIdentity: AuthIdentity;
  }
}

/**
 * The dev token is a convenience for local work, never a second authentication scheme.
 * It requires both an explicit opt-in and a non-production environment: an unset NODE_ENV
 * on a deployed instance must not be enough to hand out the dev account.
 */
function devAuthBypassEnabled(): boolean {
  return process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

type TokenVerification =
  | { identity: AuthIdentity; user: Awaited<ReturnType<typeof getUserByFirebaseUid>> }
  | Response;

async function verifyRequestToken(c: Context): Promise<TokenVerification> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    emit('auth', { reason: authHeader ? 'not_bearer' : 'missing' });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  // Presenting the dev token is worth recording wherever it happens: in a
  // production deploy NODE_ENV is the only thing keeping it out, and if that
  // ever is unset this is the event that tells you.
  if (token === 'dev-test-token') {
    emit('auth', { reason: process.env.NODE_ENV === 'production' ? 'dev_token_in_production' : 'dev_bypass' });
  }

  // Dev bypass for testing without Firebase
  if (token === 'dev-test-token' && devAuthBypassEnabled()) {
    const user = await getUserByFirebaseUid('dev-test-uid');
    if (user) {
      return {
        identity: { firebaseUid: user.firebaseUid, email: user.email, name: user.name },
        user,
      };
    }
  }

  const app = getFirebaseApp();
  if (!app) {
    emit('auth', { reason: 'provider_unavailable' });
    return c.json({ error: 'Auth service unavailable' }, 503);
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token, true);
    const user = await getUserByFirebaseUid(decoded.uid);
    return {
      identity: {
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
      },
      user,
    };
  } catch (err) {
    emit('auth', { reason: authRejectReason(err), uid: firebaseUidOf(err) });
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const verified = await verifyRequestToken(c);
  if (verified instanceof Response) return verified;

  if (!verified.user) {
    emit('auth', { reason: 'user_not_synced', uid: verified.identity.firebaseUid });
    return c.json({ error: 'User not synced' }, 401);
  }

  c.set('authIdentity', verified.identity);
  c.set('user', {
    id: verified.user.id,
    firebaseUid: verified.user.firebaseUid,
    name: verified.user.name,
    email: verified.user.email,
  });
  return next();
}

/**
 * Auth for the sync route specifically: the first call for an account happens before its
 * `users` row exists, so a verified token is enough and the row is the thing being created.
 * The request never gets to choose its own uid or email — those come from the token only.
 */
export async function syncAuthMiddleware(c: Context, next: Next) {
  const verified = await verifyRequestToken(c);
  if (verified instanceof Response) return verified;

  c.set('authIdentity', verified.identity);
  c.set('user', {
    id: verified.user?.id ?? '',
    firebaseUid: verified.identity.firebaseUid,
    name: verified.user?.name ?? verified.identity.name ?? 'User',
    email: verified.identity.email ?? verified.user?.email ?? null,
  });
  return next();
}

/**
 * verifyIdToken failures and a database failure look identical to the client.
 * A non-Firebase error here is ambiguous by construction, so it is named as what it
 * is rather than blamed on the DB.
 */
function authRejectReason(err: unknown): string {
  const code = (err as { code?: unknown } | undefined)?.code;
  if (typeof code !== 'string') return 'post_verify_error';
  if (code.includes('expired')) return 'expired';
  if (code.includes('revoked')) return 'revoked';
  if (code.includes('id-token')) return 'bad_id_token';
  if (code.includes('auth/')) return 'firebase_auth_error';
  return 'post_verify_error';
}

function firebaseUidOf(err: unknown): string | undefined {
  const uid = (err as { uid?: unknown } | undefined)?.uid;
  return typeof uid === 'string' ? uid : undefined;
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return next();
  return authMiddleware(c, next);
}

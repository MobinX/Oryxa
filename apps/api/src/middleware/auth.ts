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

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
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
  if (token === 'dev-test-token' && process.env.NODE_ENV !== 'production') {
    const user = await getUserByFirebaseUid('dev-test-uid');
    if (user) {
      c.set('user', {
        id: user.id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
      });
      return next();
    }
  }

  const app = getFirebaseApp();
  if (!app) {
    emit('auth', { reason: 'provider_unavailable' });
    return c.json({ error: 'Auth service unavailable' }, 503);
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    const user = await getUserByFirebaseUid(decoded.uid);
    if (!user) {
      emit('auth', { reason: 'user_not_synced', uid: decoded.uid });
      return c.json({ error: 'User not synced' }, 401);
    }
    c.set('user', {
      id: user.id,
      firebaseUid: user.firebaseUid,
      name: user.name,
      email: user.email,
    });
    return next();
  } catch (err) {
    emit('auth', { reason: authRejectReason(err), uid: firebaseUidOf(err) });
    return c.json({ error: 'Invalid token' }, 401);
  }
}

/**
 * verifyIdToken failures and a database failure look identical to the client.
 * A non-Firebase error here is ambiguous by construction, because the try block
 * also wraps next() — so it is named as what it is rather than blamed on the DB.
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

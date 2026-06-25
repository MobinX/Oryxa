import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Context, Next } from 'hono';
import { getUserByFirebaseUid } from '@repo/db/crud/user';

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
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

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
    return c.json({ error: 'Auth service unavailable' }, 503);
  }

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    const user = await getUserByFirebaseUid(decoded.uid);
    if (!user) {
      return c.json({ error: 'User not synced' }, 401);
    }
    c.set('user', {
      id: user.id,
      firebaseUid: user.firebaseUid,
      name: user.name,
      email: user.email,
    });
    return next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return next();
  return authMiddleware(c, next);
}

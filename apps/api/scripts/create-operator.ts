/**
 * Creates the operator's Firebase account, its row in `users`, and hands the playground store
 * (`oryxa-sandbox`) to it — so the admin console signs in through Firebase with one identity
 * instead of borrowing whoever's Google account happens to own a store.
 *
 *   bun --env-file=.env apps/api/scripts/create-operator.ts
 *
 * Reads `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` (the same three
 * the API's auth middleware uses) and never prints them. Override the identity with
 * `LOGS_UI_USER` (the local part, as today) and `ADMIN_SIGNIN_DOMAIN`, which together form the
 * email Firebase stores it under.
 *
 * Re-runnable: an existing auth user is left alone — its password is never reset, because a
 * silent reset would lock out whoever is already using it — and `syncUser` is an upsert.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { db } from '@repo/db/client';
import { businesses } from '@repo/db/schema';
import { ADMIN_SANDBOX_SLUG } from '@repo/db/crud/business';
import { syncUser } from '@repo/db/crud/user';

const localPart = process.env.LOGS_UI_USER?.trim() || 'admin123';
const domain = process.env.ADMIN_SIGNIN_DOMAIN?.trim() || 'oryxa.app';
const email = `${localPart}@${domain}`;
// Deliberately no default. This account is the gate for the whole operator console, so a
// password that ships in the repository is a credential anyone with read access already knows.
const password = process.env.ADMIN_SIGNIN_PASSWORD?.trim();
const displayName = process.env.ADMIN_SIGNIN_NAME?.trim() || 'Oryxa Operator';

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error(
    'Firebase Admin is not configured — needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and ' +
      'FIREBASE_PRIVATE_KEY (the same three the API uses). Run it with --env-file=.env.',
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = getAuth();

let uid: string;
const existing = await auth.getUserByEmail(email).catch(() => null);
if (existing) {
  uid = existing.uid;
  console.log(`auth user ${email} already exists (${uid}) — password left as it is`);
} else {
  try {
    if (!password) {
      console.error(
        `${email} does not exist yet and no password was given — set ADMIN_SIGNIN_PASSWORD and ` +
          'run it again. Nothing else in this script needs it: an existing account is left alone.',
      );
      process.exit(1);
    }
    const created = await auth.createUser({ email, password, displayName, emailVerified: true });
    uid = created.uid;
    console.log(`created auth user ${email} (${uid})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`could not create ${email}: ${message}`);
    if (message.includes('operation-not-allowed')) {
      console.error(
        '\nThe Email/Password provider is switched off in this Firebase project. Firebase ' +
          'Console → Authentication → Sign-in method → enable Email/Password, then run this again.',
      );
    }
    process.exit(1);
  }
}

const account = await syncUser({ firebaseUid: uid, name: displayName, email, signInMethod: 'password' });
console.log(`users row: ${account.id} for ${account.email}`);

const [sandbox] = await db
  .update(businesses)
  .set({ userId: account.id })
  .where(eq(businesses.slug, ADMIN_SANDBOX_SLUG))
  .returning({ id: businesses.id, name: businesses.name });

console.log(
  sandbox
    ? `${ADMIN_SANDBOX_SLUG} (${sandbox.id}) is now owned by ${email}`
    : `no ${ADMIN_SANDBOX_SLUG} store yet — run packages/db/scripts/seed-admin-sandbox.ts ${email}`,
);

console.log(`\nsign in at /admin/login with user id "${localPart}" and that password.`);
process.exit(0);

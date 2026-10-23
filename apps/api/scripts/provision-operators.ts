/**
 * Provision operator accounts from a credentials file (never printed), deactivate the legacy
 * admin123@oryxa.app identity (Firebase disabled, rows kept) and revoke sessions.
 *   bun --env-file=.env apps/api/scripts/provision-operators.ts <accounts.env>
 * accounts.env: ADMIN1_EMAIL/ADMIN1_PASSWORD, ADMIN2_EMAIL/ADMIN2_PASSWORD (read literally, no $ expansion).
 */
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { db } from '@repo/db/client';
import { businesses, users } from '@repo/db/schema';
import { ADMIN_SANDBOX_SLUG } from '@repo/db/crud/business';
import { syncUser } from '@repo/db/crud/user';

const file = process.argv[2];
if (!file) { console.error('usage: provision-operators.ts <accounts.env>'); process.exit(1); }
const vars: Record<string, string> = {};
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
  vars[m[1]] = v;
}
const accounts = [1, 2].map((i) => ({ email: vars[`ADMIN${i}_EMAIL`]?.trim().toLowerCase(), password: vars[`ADMIN${i}_PASSWORD`] }));
for (const [i, a] of accounts.entries()) {
  if (!a.email || !a.password) { console.error(`ADMIN${i + 1} missing`); process.exit(1); }
  if (a.password.length < 8) { console.error(`ADMIN${i + 1} password too weak (<8)`); process.exit(1); }
  if (a.password.length < 12) console.warn(`warning: ADMIN${i + 1} password shorter than recommended 12 chars`);
}
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n') }) });
const auth = getAuth();
const ids: string[] = [];
for (const [i, a] of accounts.entries()) {
  const existing = await auth.getUserByEmail(a.email!).catch(() => null);
  const u = existing
    ? await auth.updateUser(existing.uid, { password: a.password, disabled: false, emailVerified: true })
    : await auth.createUser({ email: a.email!, password: a.password, emailVerified: true, displayName: `Operator ${i + 1}` });
  await auth.revokeRefreshTokens(u.uid);
  const row = await syncUser({ firebaseUid: u.uid, name: u.displayName || `Operator ${i + 1}`, email: a.email!, signInMethod: 'password' });
  ids.push(row.id);
  console.log(`ADMIN${i + 1}: ${existing ? 'updated' : 'created'}, sessions revoked`);
}
const legacy = await auth.getUserByEmail('admin123@oryxa.app').catch(() => null);
if (legacy) {
  await auth.updateUser(legacy.uid, { disabled: true });
  await auth.revokeRefreshTokens(legacy.uid);
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.firebaseUid, legacy.uid));
  if (row) {
    const moved = await db.update(businesses).set({ userId: ids[0] }).where(eq(businesses.userId, row.id)).returning({ slug: businesses.slug });
    console.log(`admin123: disabled + revoked; ${moved.length} store(s) moved to ADMIN1 (${moved.map((m) => m.slug).join(',')})`);
  } else console.log('admin123: disabled + revoked (no users row)');
} else console.log('admin123@oryxa.app: no Firebase account');
const [sb] = await db.select({ userId: businesses.userId }).from(businesses).where(eq(businesses.slug, ADMIN_SANDBOX_SLUG));
if (sb && !ids.includes(sb.userId!)) console.log(`${ADMIN_SANDBOX_SLUG} owned by another user (left as-is)`);
process.exit(0);

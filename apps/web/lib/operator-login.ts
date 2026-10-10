/**
 * What the console login needs is not "is this a valid token" — the API answers that on every
 * `/api/v1` call — but "is this token the operator's account". That question cannot be answered
 * from the request: the email in the `users` table is written by `POST /api/v1/users/sync`, which
 * is unauthenticated, so any account holder can put any email beside their own uid.
 *
 * So the binding is read from Google instead of from anything this app stores. `accounts:lookup`
 * returns the record an ID token belongs to, and the key it is called with is the same public
 * web-API key the browser already ships with — it authorises the call, it does not sign anything.
 */
const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

export interface VerifiedToken {
  uid: string;
  email: string | null;
}

export async function verifyOperatorToken(idToken: string): Promise<VerifiedToken | null> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key || !idToken) return null;

  const res = await fetch(`${LOOKUP_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as {
    users?: Array<{ localId?: string; uid?: string; email?: string }>;
  } | null;
  const account = body?.users?.[0];
  const uid = account?.localId ?? account?.uid;
  if (!uid) return null;

  return { uid, email: account?.email ?? null };
}

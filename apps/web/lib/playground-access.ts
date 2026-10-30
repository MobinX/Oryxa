import { getAuthToken } from '@/lib/auth';
import { getOperatorAuthToken } from '@/lib/admin-access';

export type PlaygroundAuth = { status: number; error: string } | null;

/**
 * Cheap presence check for the routes' first line of defence: no signed-in session of either kind
 * means the run is refused before the request body is even read. The full ownership check
 * (`authorizePlaygroundRun`) still runs afterwards — this is the gate, not the proof.
 */
export async function hasPlaygroundToken(): Promise<boolean> {
  const opToken = await getOperatorAuthToken();
  if (opToken) return true;
  return Boolean(await getAuthToken());
}

/**
 * Who may drive a playground run: the signed-in account that owns the store being driven, and no
 * further. This route was built as an admin tool and used to demand the operator's own sign-in,
 * which locked every store out of the playground page the app ships to them at
 * `/b/[businessId]/playground`.
 *
 * Ownership is the boundary instead, because the endpoints it forwards to (`/internal/*`) are
 * keyed by a shared secret and cannot tell one merchant from another. So the caller's own token
 * has to answer two questions against the merchant API before anything is forwarded: can it read
 * this store's agent, and does the channel it wants to simulate a customer on belong to that same
 * store. A run draws no money and posts nothing to Meta — but it does spend this store's real LLM
 * tokens, which is why "this store" has to be proven rather than taken from the request body.
 */
export async function authorizePlaygroundRun(businessId: string, channelId: string): Promise<PlaygroundAuth> {
  const opToken = await getOperatorAuthToken();
  const authToken = await getAuthToken();
  const tokens = [opToken, authToken].filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return { status: 401, error: 'Sign in to your account first' };

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;

  let lastStatus = 403;
  let lastError = 'This store is not yours';

  for (const token of tokens) {
    const headers = { Authorization: `Bearer ${token}` };
    const [agentRes, channelRes] = await Promise.all([
      fetch(`${base}/api/v1/${businessId}/agents/default`, { headers, cache: 'no-store' }),
      fetch(`${base}/api/v1/${businessId}/channels`, { headers, cache: 'no-store' }),
    ]);

    if (agentRes.ok && channelRes.ok) {
      const channels: unknown = await channelRes.json();
      if (Array.isArray(channels) && channels.some((c) => (c as { id?: string }).id === channelId)) {
        return null;
      }
      lastError = 'That channel belongs to another store';
    } else {
      lastStatus = agentRes.status !== 200 ? agentRes.status : channelRes.status;
    }
  }

  return { status: lastStatus, error: lastError };
}

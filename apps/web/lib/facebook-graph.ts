import dns from 'node:dns';

// Prefer IPv4 — Node's default "verbatim" order often tries broken IPv6 first
// and surfaces UND_ERR_CONNECT_TIMEOUT against graph.facebook.com.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // ignore on older runtimes
}

export const GRAPH_API = 'https://graph.facebook.com/v21.0';

function isRetryableNetworkError(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ||
    (err as { cause?: { code?: string } })?.cause?.code;
  const name = (err as { name?: string })?.name || '';
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    name === 'ConnectTimeoutError' ||
    name === 'TimeoutError' ||
    /timeout|ETIMEDOUT|Connect Timeout/i.test(message)
  );
}

function toUserFacingGraphError(err: unknown, fallback: string): Error {
  if (isRetryableNetworkError(err)) {
    return new Error(
      'Could not reach Facebook (network timeout). Check your internet connection and try again.',
    );
  }
  if (err instanceof Error) return new Error(err.message);
  return new Error(fallback);
}

/**
 * Facebook Graph fetch with IPv4 preference, 30s abort timeout, and one retry
 * on transient network failures. Safe for Next.js / Vercel serverless.
 */
export async function graphFetch(
  pathOrUrl: string,
  init?: RequestInit & { retries?: number },
): Promise<Response> {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `${GRAPH_API}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

  const { retries = 1, ...fetchInit } = init ?? {};
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...fetchInit,
        signal: fetchInit.signal ?? AbortSignal.timeout(30_000),
      });
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries && isRetryableNetworkError(err)) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw toUserFacingGraphError(err, 'Facebook Graph request failed.');
    }
  }

  throw toUserFacingGraphError(lastError, 'Facebook Graph request failed.');
}

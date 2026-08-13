import dns from 'node:dns';

/**
 * Prefer IPv4 when resolving hosts. Avoids intermittent ConnectTimeoutError
 * to graph.facebook.com when IPv6 routes are broken/slow.
 */
export async function register() {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // ignore
  }
}

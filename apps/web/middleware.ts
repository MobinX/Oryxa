import { NextResponse, type NextRequest } from 'next/server';
import { COMPANY_NAME } from '@/lib/brand';

/**
 * The one rule a re-brand cannot enforce anywhere else: the address a visitor typed must belong to
 * the brand the build is answering with.
 *
 * `COMPANY_NAME` is inlined into this bundle at build time (`env` in next.config.ts), and both names
 * are baked into every page. So after a swap the old domain keeps serving a site that calls itself
 * by the new name until DNS is pointed over — the navbar says OnlyOrders on a subdomain of
 * RR Computer, or a product of RR Computer on onlyorders.tech. This middleware catches that state
 * the moment a request arrives and sends the visitor to the domain that matches the name, path and
 * query intact.
 *
 * It is a 307 rather than a 308 on purpose: the brand moves both ways, and a permanent redirect
 * pinned in a browser cache would keep sending people to the wrong domain after the next swap — the
 * same reasoning next.config.ts already applies to the moved console route.
 *
 * Hosts that belong to neither brand are left alone, because a Vercel preview URL, a deployment
 * URL and localhost are all legitimate ways to reach either brand. Only a domain that names the
 * *other* brand gets redirected, so this can never turn into a redirect loop between the two.
 * `/api` is excluded outright: webhooks and the Facebook OAuth callback are registered against a
 * specific host, and rewriting them is how a sign-in breaks silently.
 */

/** The host each brand is answered on. The map is the swap's, shared by the button in lib/vercel-brand.ts. */
const BRAND_HOSTS: Record<string, string> = {
  Oryxa: 'oryxa.rrcomputer.com.bd',
  OnlyOrders: 'www.onlyorders.tech',
};

/** Every host that names the OnlyOrders brand, canonical or not. */
const ONLY_ORDERS_HOSTS = ['onlyorders.tech', 'www.onlyorders.tech'];
const ORYXA_HOSTS = ['oryxa.rrcomputer.com.bd'];

function requestHost(req: NextRequest): string {
  // A port is transport, not identity, and only ever appears on the dev box.
  return (req.headers.get('host') ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

export function middleware(req: NextRequest) {
  const host = requestHost(req);
  const onOnlyOrders = ONLY_ORDERS_HOSTS.includes(host);
  const onOryxa = ORYXA_HOSTS.includes(host);

  // Neither of the two domains: nothing here says a brand, so nothing can conflict.
  if (!onOnlyOrders && !onOryxa) return NextResponse.next();

  const expected = BRAND_HOSTS[COMPANY_NAME];
  if (!expected || host === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = expected;
  url.port = '';
  return NextResponse.redirect(url, 307);
}

export const config = {
  /**
   * Everything a visitor could name, minus what must never move: the API surface this app serves
   * itself (webhooks, the Facebook callback, uploads), Next's own assets, and the favicon.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

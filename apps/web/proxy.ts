import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COMPANY_NAME } from '@/lib/brand';

const AUTH_COOKIE = 'oryxa_token';

/**
 * The one rule a re-brand cannot enforce anywhere else: the address a visitor typed must belong to
 * the brand the build is answering with.
 *
 * `COMPANY_NAME` is inlined into this bundle at build time (`env` in next.config.ts), and both names
 * are baked into every page. So after a swap the old domain keeps serving a site that calls itself
 * by the new name until DNS is pointed over — the navbar says OnlyOrders on a subdomain of
 * RR Computer, or a product of RR Computer on onlyorders.tech. This check catches that state the
 * moment a request arrives and sends the visitor to the domain that matches the name, path and
 * query intact.
 *
 * It is a 307 rather than a 308 on purpose: the brand moves both ways, and a permanent redirect
 * pinned in a browser cache would keep sending people to the wrong domain after the next swap — the
 * same reasoning next.config.ts already applies to the moved console route.
 *
 * Hosts that belong to neither brand are left alone, because a Vercel preview URL, a deployment URL
 * and localhost are all legitimate ways to reach either brand. Only a domain that names the *other*
 * brand gets redirected, so this can never turn into a loop between the two.
 */

/** The host each brand is answered on. The map is the swap's, shared by the button in api2's lib/vercel-brand.ts. */
const BRAND_HOSTS: Record<string, string> = {
  Oryxa: 'oryxa.rrcomputer.com.bd',
  OnlyOrders: 'www.onlyorders.tech',
};

/** Every host that names the OnlyOrders brand, canonical or not. */
const ONLY_ORDERS_HOSTS = ['onlyorders.tech', 'www.onlyorders.tech'];
const ORYXA_HOSTS = ['oryxa.rrcomputer.com.bd'];

function requestHost(request: NextRequest): string {
  // A port is transport, not identity, and only ever appears on the dev box.
  return (request.headers.get('host') ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

/** The other brand's domain, or null when this request is already where its brand lives. */
function brandConflictRedirect(request: NextRequest): NextResponse | null {
  const host = requestHost(request);
  if (!ONLY_ORDERS_HOSTS.includes(host) && !ORYXA_HOSTS.includes(host)) return null;

  const expected = BRAND_HOSTS[COMPANY_NAME];
  if (!expected || host === expected) return null;

  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.hostname = expected;
  url.port = '';
  return NextResponse.redirect(url, 307);
}

export function proxy(request: NextRequest) {
  // Decided before the auth check, so a visitor is sent to the right domain even on a page they
  // would have been signed out of anyway.
  const brandRedirect = brandConflictRedirect(request);
  if (brandRedirect) return brandRedirect;

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  const isProtected = pathname.startsWith('/businesses') || pathname.startsWith('/b/');

  if (pathname === '/login') {
    if (request.nextUrl.searchParams.has('clear')) {
      const response = NextResponse.next();
      response.cookies.delete(AUTH_COOKIE);
      return response;
    }
    if (token) {
      return NextResponse.redirect(new URL('/businesses', request.url));
    }
  }

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  /**
   * The brand check has to see every path a visitor could name, which is wider than the merchant
   * auth below ever acts on — its own two guards still scope it to `/businesses`, `/b` and `/login`.
   * What stays out is what must never move: the API surface this app serves itself (webhooks, the
   * Facebook callback, uploads), Next's own assets, and the favicon.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

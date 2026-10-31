import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BRAND_HEADERS, brandForHost, normalizeBrandHost } from '@/lib/brand';

const AUTH_COOKIE = 'oryxa_token';

/**
 * The brand is decided per request from the host and passed to server components as request
 * headers. There is deliberately no redirect: `oryxa.rrcomputer.com.bd` and `onlyorders.tech`
 * both serve the same app, and only the names printed inside the page change.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHost = normalizeBrandHost(request.headers.get('host'));

  // One canonical host per brand. `www` serves the same site, so sending it to the apex
  // avoids two indexed copies competing for the same pages.
  if (requestHost.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.host = requestHost.slice(4);
    return NextResponse.redirect(url, 308);
  }

  const brand = brandForHost(requestHost);

  // Overwrite rather than append: a client must not be able to choose its own brand by sending
  // an `x-brand-company` header of its own.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(BRAND_HEADERS.company, brand.companyName);
  requestHeaders.set(BRAND_HEADERS.parent, brand.parentCompanyName);
  requestHeaders.set(BRAND_HEADERS.host, brand.host);

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const isProtected = pathname.startsWith('/businesses') || pathname.startsWith('/b/');

  if (pathname === '/login') {
    if (request.nextUrl.searchParams.has('clear')) {
      const response = NextResponse.next({ request: { headers: requestHeaders } });
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

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  /**
   * Every page request gets a brand; API routes keep their own contract and never need one.
   * Next's own assets and the favicon are excluded for the same reason as always — a header
   * on a static file changes nothing and only costs a middleware invocation.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};

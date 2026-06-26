import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export function middleware(request: NextRequest) {
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
  matcher: ['/businesses/:path*', '/b/:path*', '/login'],
};

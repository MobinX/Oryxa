import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  const isProtected = pathname.startsWith('/businesses') || pathname.startsWith('/b/');

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/businesses', request.url));
  }

  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

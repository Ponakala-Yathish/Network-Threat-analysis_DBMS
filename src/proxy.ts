// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the old name is deprecated).
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  const home = session?.role === 'Admin' ? '/admin/dashboard' : '/analyst/incidents';
  if (session && (pathname === '/' || pathname === '/login')) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!session) {
    // API clients need a status code, not an HTML redirect to the login page.
    if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Page-level role routing. (API routes enforce roles themselves via requireAuth.)
  if (!isApi) {
    if ((pathname === '/admin' || pathname.startsWith('/admin/')) && session.role !== 'Admin') {
      return NextResponse.redirect(new URL('/analyst/incidents', request.url));
    }
    if ((pathname === '/analyst' || pathname.startsWith('/analyst/')) && session.role !== 'Analyst') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files (anything with a file extension).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

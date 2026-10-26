import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const publicPaths = ['/login', '/api/auth/login', '/api/auth/logout'];
const adminPaths = ['/admin'];
const analystPaths = ['/analyst'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  
  // Check session
  const token = request.cookies.get('threat_intel_session')?.value;
  const session = token ? await verifySession(token) : null;
  
  // No session - redirect to login
  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // Check role-based access
  if (adminPaths.some(path => pathname.startsWith(path)) && session.role !== 'Admin') {
    return NextResponse.redirect(new URL('/analyst/incidents', request.url));
  }
  
  if (analystPaths.some(path => pathname.startsWith(path)) && session.role !== 'Analyst') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }
  
  // Add session headers for server components
  const response = NextResponse.next();
  response.headers.set('x-user-id', session.userId.toString());
  response.headers.set('x-user-role', session.role);
  response.headers.set('x-username', session.username);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
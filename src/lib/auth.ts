import { cookies } from 'next/headers';
import type { UserRole } from '@/types/database';
import { COOKIE_NAME, COOKIE_OPTIONS, createSession, verifySession } from '@/lib/session';
import type { SessionPayload } from '@/lib/session';
import { HttpError } from '@/lib/api-response';

export { createSession, verifySession };
export type { SessionPayload };

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, COOKIE_OPTIONS);
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function requireAuth(allowedRoles?: UserRole[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new HttpError(401, 'Unauthorized');
  if (allowedRoles && !allowedRoles.includes(session.role)) throw new HttpError(403, 'Forbidden');
  return session;
}

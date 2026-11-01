// Edge/proxy-safe session helpers: depends only on `jose` (no next/headers),
// and is the single source of truth for the cookie name and options.
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@/types/database';

export const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'threat_intel_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE,
  path: '/',
};

export interface SessionPayload {
  userId: number;
  username: string;
  role: UserRole;
}

const DEV_FALLBACK_SECRET = 'dev-secret-key-change-in-production-min-32-characters-long';
let cachedKey: Uint8Array | null = null;

// Resolved lazily (not at import) so `next build` doesn't need runtime secrets.
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    // Never silently fall back to a publicly-known secret in production:
    // anyone could forge an Admin session.
    if (!secret || secret.length < 32) {
      throw new Error('AUTH_SECRET must be set to at least 32 characters in production');
    }
  }
  cachedKey = new TextEncoder().encode(secret || DEV_FALLBACK_SECRET);
  return cachedKey;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    if (
      typeof payload.userId !== 'number' ||
      typeof payload.username !== 'string' ||
      (payload.role !== 'Admin' && payload.role !== 'Analyst')
    ) {
      return null;
    }
    return { userId: payload.userId, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

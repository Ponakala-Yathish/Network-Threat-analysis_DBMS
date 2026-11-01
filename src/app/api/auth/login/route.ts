import { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/queries';
import { createSession } from '@/lib/session';
import { COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/session';
import { verifyPassword } from '@/lib/password';
import { loginSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, readJson } from '@/lib/api-response';

// Minimal in-memory throttle: 10 failed attempts per IP+username per 15 minutes.
// (Per-process; put Redis or similar behind this if you run several instances.)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function throttleKey(request: NextRequest, username: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  return `${ip}|${username.toLowerCase()}`;
}

function isBlocked(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt < now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
  if (failures.size > 5000) {
    for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = loginSchema.safeParse(await readJson(request));
    if (!validation.success) {
      return errorResponse('Invalid credentials', 400, validation.error.flatten().fieldErrors);
    }
    const { username, password } = validation.data;

    const key = throttleKey(request, username);
    if (isBlocked(key)) return errorResponse('Too many failed attempts. Try again later.', 429);

    const user = await getUserByUsername(username);
    // Always runs a bcrypt comparison, even for unknown users (no timing oracle).
    const valid = await verifyPassword(password, user?.password_hash);
    if (!user || !valid) {
      recordFailure(key);
      return errorResponse('Invalid username or password', 401);
    }
    failures.delete(key);

    const token = await createSession({ userId: user.user_id, username: user.username, role: user.role });
    const response = successResponse({
      user: { user_id: user.user_id, username: user.username, role: user.role },
    });
    response.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

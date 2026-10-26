import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserByUsername } from '@/lib/queries';
import { createSession, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Invalid credentials', 400, validation.error.flatten().fieldErrors);
    }
    
    const { username, password } = validation.data;
    
    const user = await getUserByUsername(username);
    if (!user) {
      return errorResponse('Invalid username or password', 401);
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return errorResponse('Invalid username or password', 401);
    }
    
    const token = await createSession({
      userId: user.user_id,
      username: user.username,
      role: user.role,
    });
    
    const response = successResponse({
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
      },
    });
    
    // Set cookie on the response directly
    response.cookies.set('threat_intel_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
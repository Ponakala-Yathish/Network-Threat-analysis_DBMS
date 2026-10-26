import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAllUsers, createUser, getUserByUsername } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { createUserSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, paginatedResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    
    const users = await getAllUsers();
    return successResponse(users);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    
    const body = await request.json();
    const validation = createUserSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    
    const { username, password, role } = validation.data;
    
    // Check if username exists
    const existing = await getUserByUsername(username);
    if (existing) {
      return errorResponse('Username already exists', 409);
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser(username, passwordHash, role);
    
    return successResponse({
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
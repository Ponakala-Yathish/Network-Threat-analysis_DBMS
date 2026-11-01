import { NextRequest } from 'next/server';
import { getAllUsers, createUser } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { createUserSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, readJson } from '@/lib/api-response';

export async function GET() {
  try {
    await requireAuth(['Admin']);
    return successResponse(await getAllUsers());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);

    const validation = createUserSchema.safeParse(await readJson(request));
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    const { username, password, role } = validation.data;

    // No "does it exist?" pre-check: that was a race (two requests both pass it).
    // The UNIQUE constraint is the source of truth; a violation becomes a 409.
    try {
      const user = await createUser(username, await hashPassword(password), role);
      return successResponse(
        { user_id: user.user_id, username: user.username, role: user.role, created_at: user.created_at },
        201
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return errorResponse('Username already exists', 409);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

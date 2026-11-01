import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getUserById, countAdmins } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { createUserSchema, idParamSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, readJson } from '@/lib/api-response';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(['Admin']);
    const parsedId = idParamSchema.safeParse((await params).id);
    if (!parsedId.success) return errorResponse('Invalid user ID', 400);
    const userId = parsedId.data;

    const user = await getUserById(userId);
    if (!user) return errorResponse('User not found', 404);

    const validation = createUserSchema.partial().safeParse(await readJson(request));
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    const { username, password, role } = validation.data;

    // Don't let the last admin (or yourself) lose admin rights and lock everyone out.
    if (role && role !== user.role && user.role === 'Admin') {
      if (userId === session.userId) return errorResponse('You cannot change your own role', 403);
      if ((await countAdmins()) <= 1) return errorResponse('Cannot demote the last admin', 403);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (username) { values.push(username); updates.push(`username = $${values.length}`); }
    if (role) { values.push(role); updates.push(`role = $${values.length}`); }
    if (password) { values.push(await hashPassword(password)); updates.push(`password_hash = $${values.length}`); }
    if (updates.length === 0) return errorResponse('No fields to update', 400);

    values.push(userId);
    // A duplicate username raises 23505 -> 409 (no check-then-write race).
    const result = await query(
      `UPDATE Users SET ${updates.join(', ')} WHERE user_id = $${values.length}
       RETURNING user_id, username, role, created_at`,
      values
    );
    return successResponse(result.rows[0]);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(['Admin']);
    const parsedId = idParamSchema.safeParse((await params).id);
    if (!parsedId.success) return errorResponse('Invalid user ID', 400);
    const userId = parsedId.data;

    const user = await getUserById(userId);
    if (!user) return errorResponse('User not found', 404);

    if (user.username === 'admin') return errorResponse('Cannot delete the default admin user', 403);
    if (userId === session.userId) return errorResponse('You cannot delete your own account', 403);

    try {
      await query('DELETE FROM Users WHERE user_id = $1', [userId]);
    } catch (error) {
      // Audit_Logs.user_id is ON DELETE RESTRICT: users who resolved incidents are kept for the audit trail.
      if ((error as { code?: string }).code === '23503') {
        return errorResponse('This user has audit history and cannot be deleted', 409);
      }
      throw error;
    }
    return successResponse({ message: 'User deleted successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}

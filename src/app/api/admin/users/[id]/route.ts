import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getUserByUsername, getUserById } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { createUserSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['Admin']);
    
    const { id } = await params;
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return errorResponse('Invalid user ID', 400);
    }
    
    const user = await getUserById(userId);
    if (!user) {
      return errorResponse('User not found', 404);
    }
    
    const body = await request.json();
    const validation = createUserSchema.partial().safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    
    const { username, password, role } = validation.data;
    
    // Check username uniqueness if changing
    if (username && username !== user.username) {
      const existing = await getUserByUsername(username);
      if (existing) {
        return errorResponse('Username already exists', 409);
      }
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (username) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }
    
    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }
    
    values.push(userId);
    await query(
      `UPDATE Users SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
      values
    );
    
    const updated = await getUserById(userId);
    return successResponse({
      user_id: updated!.user_id,
      username: updated!.username,
      role: updated!.role,
      created_at: updated!.created_at,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['Admin']);
    
    const { id } = await params;
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return errorResponse('Invalid user ID', 400);
    }
    
    const user = await getUserById(userId);
    if (!user) {
      return errorResponse('User not found', 404);
    }
    
    // Prevent deleting the default admin
    if (user.username === 'admin') {
      return errorResponse('Cannot delete the default admin user', 403);
    }
    
    await query('DELETE FROM Users WHERE user_id = $1', [userId]);
    
    return successResponse({ message: 'User deleted successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
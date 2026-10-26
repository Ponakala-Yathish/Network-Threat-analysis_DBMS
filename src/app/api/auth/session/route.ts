import { getSession } from '@/lib/auth';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return errorResponse('Unauthorized', 401);
    }
    return successResponse({
      userId: session.userId,
      username: session.username,
      role: session.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
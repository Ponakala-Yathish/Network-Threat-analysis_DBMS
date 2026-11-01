import { clearSessionCookie } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function POST() {
  try {
    await clearSessionCookie();
    return successResponse({ message: 'Logged out successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}

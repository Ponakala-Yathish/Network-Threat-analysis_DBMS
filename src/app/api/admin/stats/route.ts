import { getSystemStats } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    await requireAuth(['Admin']);
    return successResponse(await getSystemStats());
  } catch (error) {
    return handleApiError(error);
  }
}

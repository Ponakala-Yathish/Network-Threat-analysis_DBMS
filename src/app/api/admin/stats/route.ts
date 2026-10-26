import { getSystemStats } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    await requireAuth(['Admin']);
    
    const stats = await getSystemStats();
    return successResponse(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
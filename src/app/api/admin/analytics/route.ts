// GET /api/admin/analytics
// Aggregate (GROUP BY / HAVING) and correlated-subquery reports for the dashboard.
import { getSecurityAnalytics } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    await requireAuth(['Admin']);
    return successResponse(await getSecurityAnalytics());
  } catch (error) {
    return handleApiError(error);
  }
}

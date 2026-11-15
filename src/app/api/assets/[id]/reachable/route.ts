// GET /api/assets/:id/reachable?max_hops=5
// Lateral-movement analysis: every asset reachable from this one through
// Asset_Connections (recursive CTE in get_reachable_assets()).
import { NextRequest } from 'next/server';
import { getAssetById, getReachableAssets } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema, reachableQuerySchema } from '@/lib/validations';
import {
  successResponse,
  errorResponse,
  handleApiError,
  searchParamsToObject,
  validationErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const id = idParamSchema.safeParse((await params).id);
    if (!id.success) return errorResponse('Invalid asset ID', 400);
    const parsed = reachableQuerySchema.safeParse(searchParamsToObject(request.nextUrl.searchParams));
    if (!parsed.success) return validationErrorResponse(parsed.error);

    if (!(await getAssetById(id.data))) return errorResponse('Asset not found', 404);
    return successResponse(await getReachableAssets(id.data, parsed.data.max_hops));
  } catch (error) {
    return handleApiError(error);
  }
}

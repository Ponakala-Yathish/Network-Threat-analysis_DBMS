import { computeBlastRadius } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const parsed = idParamSchema.safeParse((await params).assetId);
    if (!parsed.success) return errorResponse('Invalid asset ID', 400);

    const result = await computeBlastRadius(parsed.data);
    if (!result) return errorResponse('Asset not found', 404);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

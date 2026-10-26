import { computeBlastRadius, getIncidentById } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { blastRadiusSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const { assetId } = await params;
    const assetIdNum = parseInt(assetId);
    
    if (isNaN(assetIdNum)) {
      return errorResponse('Invalid asset ID', 400);
    }
    
    const result = await computeBlastRadius(assetIdNum);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
import { getIncidentById } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const parsed = idParamSchema.safeParse((await params).id);
    if (!parsed.success) return errorResponse('Invalid incident ID', 400);

    const incident = await getIncidentById(parsed.data);
    if (!incident) return errorResponse('Incident not found', 404);
    return successResponse(incident);
  } catch (error) {
    return handleApiError(error);
  }
}

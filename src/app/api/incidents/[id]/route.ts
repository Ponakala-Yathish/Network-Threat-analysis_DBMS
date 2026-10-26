import { getIncidentById, resolveIncident } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { resolveIncidentSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';
import { getSession } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const { id } = await params;
    const incidentId = parseInt(id);
    
    if (isNaN(incidentId)) {
      return errorResponse('Invalid incident ID', 400);
    }
    
    const incident = await getIncidentById(incidentId);
    if (!incident) {
      return errorResponse('Incident not found', 404);
    }
    
    return successResponse(incident);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || !['Admin', 'Analyst'].includes(session.role)) {
      return errorResponse('Unauthorized', 401);
    }
    
    const { id } = await params;
    const incidentId = parseInt(id);
    
    if (isNaN(incidentId)) {
      return errorResponse('Invalid incident ID', 400);
    }
    
    const body = await request.json();
    const validation = resolveIncidentSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    
    await resolveIncident(incidentId, session.userId, validation.data.notes);
    
    return successResponse({ message: 'Incident resolved successfully' });
  } catch (error: any) {
    if (error.message === 'UNAUTHORIZED') return errorResponse('Unauthorized', 401);
    if (error.message === 'FORBIDDEN') return errorResponse('Forbidden', 403);
    return handleApiError(error);
  }
}
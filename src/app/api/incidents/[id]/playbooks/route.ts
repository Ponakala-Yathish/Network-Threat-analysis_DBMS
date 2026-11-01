import { NextRequest } from 'next/server';
import { searchPlaybooksByVector, getIncidentById } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { embedText } from '@/lib/embeddings';
import { idParamSchema, playbookQuerySchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, searchParamsToObject } from '@/lib/api-response';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const parsedId = idParamSchema.safeParse((await params).id);
    if (!parsedId.success) return errorResponse('Invalid incident ID', 400);
    const { limit } = playbookQuerySchema.parse(searchParamsToObject(request.nextUrl.searchParams));

    const incident = await getIncidentById(parsedId.data);
    if (!incident) return errorResponse('Incident not found', 404);

    // (Was `incident.asset.internal_ip` -- but rows are flat, so `asset` was undefined
    // and any incident without a description crashed with a TypeError.)
    const text = incident.description || `Attack from ${incident.attacker_ip} targeting ${incident.target_ip}`;
    const playbooks = await searchPlaybooksByVector(embedText(text), limit);
    return successResponse(playbooks);
  } catch (error) {
    return handleApiError(error);
  }
}

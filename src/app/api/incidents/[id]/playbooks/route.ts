import { searchPlaybooksByVector } from '@/lib/queries';
import { getIncidentById } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { generateIncidentEmbedding, embeddingToPgVector } from '@/lib/embeddings';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

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
    
    // Generate embedding from incident description
    const description = incident.description || `Attack from ${incident.attacker_ip} targeting ${incident.asset.internal_ip}`;
    const embedding = await generateIncidentEmbedding(description);
    const vectorStr = embeddingToPgVector(embedding);
    
    // Search for similar playbooks
    const playbooks = await searchPlaybooksByVector(embedding, 3);
    
    return successResponse(playbooks);
  } catch (error) {
    return handleApiError(error);
  }
}
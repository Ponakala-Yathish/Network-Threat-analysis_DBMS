// POST /api/incidents/:id/resolve
// (The UI already called this URL, but the route did not exist -> every resolve was a 404.)
import { resolveIncident } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema, resolveIncidentSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, HttpError } from '@/lib/api-response';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(['Admin', 'Analyst']);
    const parsedId = idParamSchema.safeParse((await params).id);
    if (!parsedId.success) return errorResponse('Invalid incident ID', 400);

    // The body is optional: an empty POST just resolves without notes.
    const raw = await request.text();
    let body: unknown = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, 'Request body must be valid JSON');
      }
    }
    const validation = resolveIncidentSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }

    // Not-found (P0002 -> 404) and already-resolved (55000 -> 409) come from the DB function.
    await resolveIncident(parsedId.data, session.userId, validation.data.notes?.trim() || undefined);
    return successResponse({ message: 'Incident resolved successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}

// /api/playbooks
//   GET  ?q=text&limit=5  -> vector similarity search (READ by meaning)
//   GET                   -> list all playbooks
//   POST {title, ...}     -> CREATE: text is embedded and stored as a VECTOR(384)  (Admin)
import { NextRequest } from 'next/server';
import { getAllPlaybooks, searchPlaybooksByText, createPlaybook } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { createPlaybookSchema, playbookSearchSchema } from '@/lib/validations';
import {
  successResponse,
  handleApiError,
  readJson,
  searchParamsToObject,
  validationErrorResponse,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const parsed = playbookSearchSchema.safeParse(searchParamsToObject(request.nextUrl.searchParams));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const { q, limit } = parsed.data;
    return successResponse(q ? await searchPlaybooksByText(q, limit) : await getAllPlaybooks());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    const parsed = createPlaybookSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    // Duplicate title -> 23505 -> 409 via handleApiError
    return successResponse(await createPlaybook(parsed.data), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

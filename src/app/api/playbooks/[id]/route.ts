// /api/playbooks/:id
//   GET     -> one playbook
//   PUT     -> UPDATE the text and RE-EMBED the vector  (Admin)
//   DELETE  -> DELETE the playbook and its vector       (Admin)
import { NextRequest } from 'next/server';
import { getPlaybookById, updatePlaybook, deletePlaybook } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema, updatePlaybookSchema } from '@/lib/validations';
import {
  successResponse,
  errorResponse,
  handleApiError,
  readJson,
  validationErrorResponse,
} from '@/lib/api-response';

type Ctx = { params: Promise<{ id: string }> };

async function parseId(params: Ctx['params']) {
  const parsed = idParamSchema.safeParse((await params).id);
  return parsed.success ? parsed.data : null;
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const id = await parseId(params);
    if (id === null) return errorResponse('Invalid playbook ID', 400);
    const playbook = await getPlaybookById(id);
    if (!playbook) return errorResponse('Playbook not found', 404);
    return successResponse(playbook);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    await requireAuth(['Admin']);
    const id = await parseId(params);
    if (id === null) return errorResponse('Invalid playbook ID', 400);
    const parsed = updatePlaybookSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const playbook = await updatePlaybook(id, parsed.data);
    if (!playbook) return errorResponse('Playbook not found', 404);
    return successResponse(playbook);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    await requireAuth(['Admin']);
    const id = await parseId(params);
    if (id === null) return errorResponse('Invalid playbook ID', 400);
    if (!(await deletePlaybook(id))) return errorResponse('Playbook not found', 404);
    return successResponse({ message: 'Playbook deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}

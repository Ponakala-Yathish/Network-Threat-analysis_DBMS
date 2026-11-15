// /api/assets/:id
//   PUT     -> edit hostname / criticality / department  (Admin)
//   DELETE  -> remove an asset (409 while logs or incidents still reference it)  (Admin)
import { NextRequest } from 'next/server';
import { updateAsset, deleteAsset } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { idParamSchema, updateAssetSchema } from '@/lib/validations';
import {
  successResponse,
  errorResponse,
  handleApiError,
  readJson,
  validationErrorResponse,
} from '@/lib/api-response';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    await requireAuth(['Admin']);
    const id = idParamSchema.safeParse((await params).id);
    if (!id.success) return errorResponse('Invalid asset ID', 400);
    const parsed = updateAssetSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const asset = await updateAsset(id.data, parsed.data);
    if (!asset) return errorResponse('Asset not found', 404);
    return successResponse(asset);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    await requireAuth(['Admin']);
    const id = idParamSchema.safeParse((await params).id);
    if (!id.success) return errorResponse('Invalid asset ID', 400);
    try {
      if (!(await deleteAsset(id.data))) return errorResponse('Asset not found', 404);
    } catch (error) {
      // Traffic_Logs and Incidents reference assets with ON DELETE RESTRICT.
      if ((error as { code?: string }).code === '23503') {
        return errorResponse('This asset has traffic logs or incidents and cannot be deleted', 409);
      }
      throw error;
    }
    return successResponse({ message: 'Asset deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}

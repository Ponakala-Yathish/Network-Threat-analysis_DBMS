import { NextRequest } from 'next/server';
import { getAllAssets, getAssetById, createAsset } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { createAssetSchema, idParamSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, readJson } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);

    const rawId = request.nextUrl.searchParams.get('id');
    if (rawId !== null) {
      const parsed = idParamSchema.safeParse(rawId);
      if (!parsed.success) return errorResponse('Invalid asset ID', 400);
      const asset = await getAssetById(parsed.data);
      if (!asset) return errorResponse('Asset not found', 404);
      return successResponse(asset);
    }

    return successResponse(await getAllAssets());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    const validation = createAssetSchema.safeParse(await readJson(request));
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    // Duplicate IP -> 23505 -> 409 via handleApiError
    return successResponse(await createAsset(validation.data), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

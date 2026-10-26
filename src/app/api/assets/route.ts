import { NextRequest } from 'next/server';
import { getAllAssets, getAssetById, createAsset } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { createAssetSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const searchParams = request.nextUrl.searchParams;
    const assetId = searchParams.get('id');
    
    if (assetId) {
      const asset = await getAssetById(parseInt(assetId));
      if (!asset) {
        return errorResponse('Asset not found', 404);
      }
      return successResponse(asset);
    }
    
    const assets = await getAllAssets();
    return successResponse(assets);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    
    const body = await request.json();
    const validation = createAssetSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    
    const asset = await createAsset(validation.data);
    return successResponse(asset, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
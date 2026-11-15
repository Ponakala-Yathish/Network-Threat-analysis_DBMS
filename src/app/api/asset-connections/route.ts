// /api/asset-connections  (network topology used by the recursive query)
//   GET                                                   -> list all connections
//   POST {src_asset_id, dst_asset_id, connection_type}    (Admin)
//   DELETE ?src=1&dst=2                                    (Admin)
import { NextRequest } from 'next/server';
import { getAssetConnections, createAssetConnection, deleteAssetConnection } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { assetConnectionSchema, idParamSchema } from '@/lib/validations';
import {
  successResponse,
  errorResponse,
  handleApiError,
  readJson,
  validationErrorResponse,
} from '@/lib/api-response';

export async function GET() {
  try {
    await requireAuth(['Admin', 'Analyst']);
    return successResponse(await getAssetConnections());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    const parsed = assetConnectionSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const { src_asset_id, dst_asset_id, connection_type } = parsed.data;
    // Duplicate pair -> 23505 -> 409; unknown asset -> 23503 -> 409
    return successResponse(await createAssetConnection(src_asset_id, dst_asset_id, connection_type), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    const src = idParamSchema.safeParse(request.nextUrl.searchParams.get('src'));
    const dst = idParamSchema.safeParse(request.nextUrl.searchParams.get('dst'));
    if (!src.success || !dst.success) return errorResponse('src and dst asset IDs are required', 400);
    if (!(await deleteAssetConnection(src.data, dst.data))) return errorResponse('Connection not found', 404);
    return successResponse({ message: 'Connection deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}

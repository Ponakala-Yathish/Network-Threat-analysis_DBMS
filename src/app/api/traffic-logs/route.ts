import { NextRequest } from 'next/server';
import { getTrafficLogs, createTrafficLog } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { trafficLogSchema, trafficLogFiltersSchema } from '@/lib/validations';
import {
  successResponse,
  errorResponse,
  handleApiError,
  paginatedResponse,
  readJson,
  searchParamsToObject,
} from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);

    // Build from a plain object: URLSearchParams.get() returns `null` for a missing
    // key, and `z.enum([...]).optional()` rejects null -- so the old code returned
    // HTTP 400 for every request that didn't include `status`.
    const filters = trafficLogFiltersSchema.parse(searchParamsToObject(request.nextUrl.searchParams));

    const result = await getTrafficLogs({
      attackerIp: filters.attacker_ip,
      targetId: filters.target_id,
      status: filters.status,
      protocol: filters.protocol,
      port: filters.port,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      page: filters.page,
      pageSize: filters.page_size,
    });
    return paginatedResponse(result.data, result.total, result.page, result.page_size);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const validation = trafficLogSchema.safeParse(await readJson(request));
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    // Unknown target asset -> FK violation -> 409 via handleApiError
    return successResponse(await createTrafficLog(validation.data), 201);
  } catch (error) {
    return handleApiError(error);
  }
}

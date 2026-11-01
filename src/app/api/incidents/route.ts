import { NextRequest } from 'next/server';
import { getIncidents } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { incidentFiltersSchema } from '@/lib/validations';
import { handleApiError, paginatedResponse, searchParamsToObject } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    const filters = incidentFiltersSchema.parse(searchParamsToObject(request.nextUrl.searchParams));

    const result = await getIncidents({
      status: filters.status,
      attackerIp: filters.attacker_ip,
      targetId: filters.target_id,
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

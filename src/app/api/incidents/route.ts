import { NextRequest } from 'next/server';
import { getIncidents } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { incidentFiltersSchema } from '@/lib/validations';
import { successResponse, handleApiError, paginatedResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const searchParams = request.nextUrl.searchParams;
    
    const filters = incidentFiltersSchema.parse({
      status: searchParams.get('status') || undefined,
      attacker_ip: searchParams.get('attacker_ip') || undefined,
      target_id: searchParams.get('target_id') ? parseInt(searchParams.get('target_id')!) : undefined,
      date_from: searchParams.get('date_from') ? new Date(searchParams.get('date_from')!) : undefined,
      date_to: searchParams.get('date_to') ? new Date(searchParams.get('date_to')!) : undefined,
      page: parseInt(searchParams.get('page') || '1'),
      page_size: parseInt(searchParams.get('page_size') || '20'),
    });
    
    const result = await getIncidents({
      status: filters.status,
      attackerIp: filters.attacker_ip,
      targetId: filters.target_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      page: filters.page,
      pageSize: filters.page_size,
    });
    
    return paginatedResponse(
      result.data,
      result.total,
      result.page,
      result.page_size
    );
  } catch (error) {
    return handleApiError(error);
  }
}
import { NextRequest } from 'next/server';
import { getTrafficLogs, createTrafficLog, getAllAssets } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { trafficLogSchema, trafficLogFiltersSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, paginatedResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const searchParams = request.nextUrl.searchParams;
    
    const filters = trafficLogFiltersSchema.parse({
      attacker_ip: searchParams.get('attacker_ip') || undefined,
      target_id: searchParams.get('target_id') ? parseInt(searchParams.get('target_id')!) : undefined,
      status: searchParams.get('status') as 'Allowed' | 'Blocked' | 'Failed' | undefined,
      protocol: searchParams.get('protocol') || undefined,
      port: searchParams.get('port') ? parseInt(searchParams.get('port')!) : undefined,
      date_from: searchParams.get('date_from') ? new Date(searchParams.get('date_from')!) : undefined,
      date_to: searchParams.get('date_to') ? new Date(searchParams.get('date_to')!) : undefined,
      page: parseInt(searchParams.get('page') || '1'),
      page_size: parseInt(searchParams.get('page_size') || '50'),
    });
    
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

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin', 'Analyst']);
    
    const body = await request.json();
    const validation = trafficLogSchema.safeParse(body);
    
    if (!validation.success) {
      return errorResponse('Validation failed', 400, validation.error.flatten().fieldErrors);
    }
    
    const log = await createTrafficLog(validation.data);
    return successResponse(log, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
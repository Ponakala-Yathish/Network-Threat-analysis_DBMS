import { NextRequest } from 'next/server';
import { getAuditLogs } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { auditLogFiltersSchema } from '@/lib/validations';
import { successResponse, errorResponse, handleApiError, paginatedResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    
    const searchParams = request.nextUrl.searchParams;
    const exportCsv = searchParams.get('export') === 'true';
    
    const filters = auditLogFiltersSchema.parse({
      user_id: searchParams.get('user_id') ? parseInt(searchParams.get('user_id')!) : undefined,
      action: searchParams.get('action') || undefined,
      incident_id: searchParams.get('incident_id') ? parseInt(searchParams.get('incident_id')!) : undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      page_size: exportCsv ? 10000 : parseInt(searchParams.get('page_size') || '20'),
    });
    
    const result = await getAuditLogs({
      userId: filters.user_id,
      action: filters.action,
      incidentId: filters.incident_id,
      dateFrom: filters.date_from ? new Date(filters.date_from) : undefined,
      dateTo: filters.date_to ? new Date(filters.date_to) : undefined,
      page: filters.page,
      pageSize: filters.page_size,
    });
    
    if (exportCsv) {
      const csv = [
        ['Audit ID', 'Incident ID', 'Attacker IP', 'Incident Status', 'User', 'User Role', 'Action', 'Old Status', 'New Status', 'Notes', 'Timestamp'],
        ...result.data.map(row => [
          row.audit_id,
          row.incident_id,
          row.incident_attacker_ip,
          row.incident_status,
          row.user_username,
          row.user_role,
          row.action,
          row.old_status || '',
          row.new_status || '',
          row.notes ? row.notes.replace(/"/g, '""') : '',
          row.created_at,
        ]).map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }
    
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
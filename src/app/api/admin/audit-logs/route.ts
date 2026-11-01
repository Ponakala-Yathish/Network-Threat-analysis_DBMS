import { NextRequest } from 'next/server';
import { getAuditLogs, getAuditLogsForExport } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { auditLogFiltersSchema } from '@/lib/validations';
import { handleApiError, paginatedResponse, searchParamsToObject } from '@/lib/api-response';

// RFC 4180 quoting, plus neutralising spreadsheet formula injection: a cell that
// starts with = + - @ is executed as a formula by Excel/Sheets. Analyst-entered
// resolution notes end up in this export, so this matters.
function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(['Admin']);

    const params = searchParamsToObject(request.nextUrl.searchParams);
    const filters = auditLogFiltersSchema.parse(params);
    const common = {
      userId: filters.user_id,
      action: filters.action,
      incidentId: filters.incident_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
    };

    if (filters.export === 'true') {
      // (Before: export asked for page_size 10000, but the schema caps page_size at
      // 100, so every export failed validation.)
      const rows = await getAuditLogsForExport(common);
      const header = [
        'Audit ID', 'Incident ID', 'Attacker IP', 'Incident Status', 'User', 'User Role',
        'Action', 'Old Status', 'New Status', 'Notes', 'Timestamp',
      ];
      const lines = [
        header.map(csvCell).join(','),
        ...rows.map((r) =>
          [
            r.audit_id, r.incident_id, r.incident_attacker_ip, r.incident_status, r.user_username,
            r.user_role, r.action, r.old_status, r.new_status, r.notes, r.created_at,
          ].map(csvCell).join(',')
        ),
      ];
      return new Response(lines.join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const result = await getAuditLogs({ ...common, page: filters.page, pageSize: filters.page_size });
    return paginatedResponse(result.data, result.total, result.page, result.page_size);
  } catch (error) {
    return handleApiError(error);
  }
}

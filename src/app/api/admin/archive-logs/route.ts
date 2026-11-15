// POST /api/admin/archive-logs  {older_than_days: 30}
// Runs the stored procedure:  CALL archive_old_logs(days, NULL)
import { NextRequest } from 'next/server';
import { archiveOldTrafficLogs } from '@/lib/queries';
import { requireAuth } from '@/lib/auth';
import { archiveLogsSchema } from '@/lib/validations';
import { successResponse, handleApiError, readJson, validationErrorResponse } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    await requireAuth(['Admin']);
    const parsed = archiveLogsSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const archived = await archiveOldTrafficLogs(parsed.data.older_than_days);
    return successResponse({ archived, older_than_days: parsed.data.older_than_days });
  } catch (error) {
    return handleApiError(error);
  }
}

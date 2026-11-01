import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

export function paginatedResponse<T>(data: T[], total: number, page: number, pageSize: number) {
  return successResponse({
    data,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

/** Parse a JSON request body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

/** Raw query-string -> plain object (absent params are simply absent, never `null`). */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) {
    if (value !== '') out[key] = value;
  }
  return out;
}

// PostgreSQL SQLSTATE -> HTTP. Keeps database errors from surfacing as opaque 500s.
const PG_ERRORS: Record<string, [number, string]> = {
  '22P02': [400, 'Invalid value (check IP addresses and numeric fields)'],
  '22003': [400, 'Numeric value out of range'],
  '23502': [400, 'A required field is missing'],
  '23514': [400, 'Value violates a database constraint'],
  '23505': [409, 'A record with these values already exists'],
  '23503': [409, 'Referenced record does not exist, or the record is still referenced elsewhere'],
  '57014': [503, 'Query timed out'],
  P0002: [404, 'Not found'], // raised by resolve_incident
  '55000': [409, 'Incident is already resolved'], // raised by resolve_incident
};

export function handleApiError(error: unknown, defaultMessage = 'Internal server error') {
  if (error instanceof HttpError) {
    return errorResponse(error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return errorResponse('Validation failed', 400, error.flatten().fieldErrors);
  }
  const code = (error as { code?: string } | null)?.code;
  if (code && PG_ERRORS[code]) {
    const [status, message] = PG_ERRORS[code];
    return errorResponse(message, status);
  }
  console.error('API Error:', error);
  return errorResponse(defaultMessage, 500);
}

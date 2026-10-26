import { NextResponse } from 'next/server';

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400, details?: any) {
  return NextResponse.json(
    { error: message, ...(details && { details }) },
    { status }
  );
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return successResponse({
    data,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
  });
}

export function handleApiError(error: unknown, defaultMessage = 'Internal server error') {
  console.error('API Error:', error);
  
  if (error instanceof Error) {
    if (error.message === 'UNAUTHORIZED') {
      return errorResponse('Unauthorized', 401);
    }
    if (error.message === 'FORBIDDEN') {
      return errorResponse('Forbidden', 403);
    }
    if (error.message === 'NOT_FOUND') {
      return errorResponse('Not found', 404);
    }
    if (error.name === 'ZodError') {
      return errorResponse('Validation error', 400, error);
    }
  }
  
  return errorResponse(defaultMessage, 500);
}
import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['Admin', 'Analyst']),
});

// Incident schemas
export const resolveIncidentSchema = z.object({
  notes: z.string().optional(),
});

export const incidentFiltersSchema = z.object({
  status: z.enum(['Active', 'Resolved']).optional(),
  attacker_ip: z.string().optional(),
  target_id: z.coerce.number().optional(),
  date_from: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  date_to: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  page: z.coerce.number().min(1).default(1),
  page_size: z.coerce.number().min(1).max(100).default(20),
});

// Traffic log schemas
export const trafficLogSchema = z.object({
  attackerIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address'),
  targetId: z.number().int().positive('Target asset ID required'),
  status: z.enum(['Allowed', 'Blocked', 'Failed']),
  protocol: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  bytesTransferred: z.number().int().min(0).default(0),
});

export const trafficLogFiltersSchema = z.object({
  attacker_ip: z.string().optional(),
  target_id: z.coerce.number().optional(),
  status: z.enum(['Allowed', 'Blocked', 'Failed']).optional(),
  protocol: z.string().optional(),
  port: z.coerce.number().optional(),
  date_from: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  date_to: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  page: z.coerce.number().min(1).default(1),
  page_size: z.coerce.number().min(1).max(100).default(50),
});

// Asset schemas
export const createAssetSchema = z.object({
  internalIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IP address'),
  hostname: z.string().max(100).optional(),
  criticality: z.number().int().min(1).max(10),
  department: z.string().max(50).optional(),
});

// Admin schemas
export const logRotationSchema = z.object({
  older_than_days: z.coerce.number().int().min(1).max(365).default(30),
});

export const auditLogFiltersSchema = z.object({
  user_id: z.coerce.number().optional(),
  action: z.string().optional(),
  incident_id: z.coerce.number().optional(),
  date_from: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  date_to: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  page: z.coerce.number().min(1).default(1),
  page_size: z.coerce.number().min(1).max(100).default(50),
});

// Blast radius schema
export const blastRadiusSchema = z.object({
  asset_id: z.number().int().positive(),
});

// Types
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;
export type IncidentFilters = z.infer<typeof incidentFiltersSchema>;
export type TrafficLogInput = z.infer<typeof trafficLogSchema>;
export type TrafficLogFilters = z.infer<typeof trafficLogFiltersSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type LogRotationInput = z.infer<typeof logRotationSchema>;
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;
export type BlastRadiusInput = z.infer<typeof blastRadiusSchema>;
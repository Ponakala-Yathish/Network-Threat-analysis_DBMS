import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

// Real IP validation. The old /^(\d{1,3}\.){3}\d{1,3}$/ accepted 999.999.999.999,
// which PostgreSQL then rejected with an unhandled error (HTTP 500).
const ipAddress = z.union([z.ipv4(), z.ipv6()], { error: 'Invalid IP address' });

// Query-string values arrive as strings; empty string means "not provided".
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date({ error: 'Invalid date' }).optional()
);

const pagination = (defaultPageSize: number) => ({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(defaultPageSize),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(1, 'Password is required').max(200),
});

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  role: z.enum(['Admin', 'Analyst']),
});

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
export const resolveIncidentSchema = z.object({
  notes: z.string().max(2000, 'Notes must be 2000 characters or fewer').optional(),
});

export const incidentFiltersSchema = z.object({
  status: z.enum(['Active', 'Resolved']).optional(),
  attacker_ip: ipAddress.optional(),
  target_id: z.coerce.number().int().positive().optional(),
  date_from: optionalDate,
  date_to: optionalDate,
  ...pagination(20),
});

// ---------------------------------------------------------------------------
// Traffic logs
// ---------------------------------------------------------------------------
export const trafficLogSchema = z.object({
  attackerIp: ipAddress,
  targetId: z.number().int().positive('Target asset ID required'),
  status: z.enum(['Allowed', 'Blocked', 'Failed']),
  protocol: z.string().max(20).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  bytesTransferred: z.number().int().min(0).default(0),
});

export const trafficLogFiltersSchema = z.object({
  attacker_ip: ipAddress.optional(),
  target_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['Allowed', 'Blocked', 'Failed']).optional(),
  protocol: z.string().max(20).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  date_from: optionalDate,
  date_to: optionalDate,
  ...pagination(50),
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export const createAssetSchema = z.object({
  internalIp: ipAddress,
  hostname: z.string().max(100).optional(),
  criticality: z.number().int().min(1).max(10),
  department: z.string().max(50).optional(),
});

export const idParamSchema = z.coerce.number().int().positive();

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const logRotationSchema = z.object({
  older_than_days: z.coerce.number().int().min(1).max(365).default(30),
});

export const auditLogFiltersSchema = z.object({
  user_id: z.coerce.number().int().positive().optional(),
  action: z.string().max(50).optional(),
  incident_id: z.coerce.number().int().positive().optional(),
  date_from: optionalDate,
  date_to: optionalDate,
  export: z.enum(['true', 'false']).optional(),
  ...pagination(50),
});

export const blastRadiusSchema = z.object({
  asset_id: z.number().int().positive(),
});

export const playbookQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

// ---------------------------------------------------------------------------
// Assets (update) and topology
// ---------------------------------------------------------------------------
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().max(max).nullable().optional());

export const updateAssetSchema = z
  .object({
    hostname: optionalText(100),
    criticality: z.number().int().min(1).max(10).optional(),
    department: optionalText(50),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { error: 'No fields to update' });

export const CONNECTION_TYPES = ['network', 'database', 'file-share', 'admin', 'replication'] as const;

export const assetConnectionSchema = z
  .object({
    src_asset_id: z.coerce.number().int().positive(),
    dst_asset_id: z.coerce.number().int().positive(),
    connection_type: z.enum(CONNECTION_TYPES).default('network'),
  })
  .refine((d) => d.src_asset_id !== d.dst_asset_id, {
    error: 'An asset cannot connect to itself',
    path: ['dst_asset_id'],
  });

export const reachableQuerySchema = z.object({
  max_hops: z.coerce.number().int().min(1).max(10).default(5),
});

export const archiveLogsSchema = z.object({
  older_than_days: z.coerce.number().int().min(1).max(3650).default(30),
});

// ---------------------------------------------------------------------------
// Security playbooks (vector CRUD)
// ---------------------------------------------------------------------------
const tagList = z
  .array(z.string().trim().min(1).max(50))
  .max(20)
  .nullable()
  .optional();

export const createPlaybookSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  threat_category: optionalText(100),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  mitigation: z.string().trim().min(10, 'Mitigation must be at least 10 characters').max(10000),
  tags: tagList,
});

export const updatePlaybookSchema = createPlaybookSchema
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), { error: 'No fields to update' });

export const playbookSearchSchema = z.object({
  q: z.string().trim().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

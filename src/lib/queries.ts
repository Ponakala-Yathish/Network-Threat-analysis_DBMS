import { query } from '@/lib/db';
import { embeddingToPgVector } from '@/lib/embeddings';
import type {
  User,
  NetworkAsset,
  TrafficLog,
  IncidentWithAsset,
  TrafficLogWithAsset,
  AuditLogWithRelations,
  BlastRadiusResult,
  PlaybookSearchResult,
  PlaybookSummary,
  SystemStats,
  PaginatedResponse,
} from '@/types/database';

// ============================================
// Shared helpers
// ============================================

/** Builds `WHERE a = $1 AND b >= $2 ...` with correctly numbered placeholders. */
class WhereBuilder {
  private conditions: string[] = [];
  readonly params: unknown[] = [];

  add(sqlWithPlaceholder: string, value: unknown) {
    if (value === undefined || value === null || value === '') return this;
    this.params.push(value);
    this.conditions.push(sqlWithPlaceholder.replace('?', `$${this.params.length}`));
    return this;
  }

  get isEmpty() {
    return this.conditions.length === 0;
  }

  get clause() {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }
}

const ASSET_COLUMNS = `
  na.internal_ip  AS target_ip,
  na.hostname     AS target_hostname,
  na.criticality  AS asset_criticality,
  na.department   AS asset_department`;

/**
 * Exact COUNT(*) on a multi-million-row table is a full scan. With no filters
 * and a big table, the planner's row estimate is accurate enough for paging
 * and is instant; everything else gets an exact count.
 */
async function countRows(table: string, alias: string, where: WhereBuilder): Promise<number> {
  if (where.isEmpty) {
    const est = await query<{ estimate: number }>(
      `SELECT reltuples::bigint AS estimate FROM pg_class WHERE oid = to_regclass($1)`,
      [table]
    );
    const estimate = Number(est.rows[0]?.estimate ?? -1);
    if (estimate > 100_000) return estimate;
  }
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${table} ${alias} ${where.clause}`,
    where.params
  );
  return result.rows[0].count;
}

function pageOf<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
  return { data, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ============================================
// USER QUERIES
// ============================================
export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query<User>('SELECT * FROM Users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

export async function getUserById(userId: number): Promise<User | null> {
  const result = await query<User>('SELECT * FROM Users WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function createUser(
  username: string,
  passwordHash: string,
  role: 'Admin' | 'Analyst'
): Promise<User> {
  const result = await query<User>(
    `INSERT INTO Users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *`,
    [username, passwordHash, role]
  );
  return result.rows[0];
}

export async function getAllUsers(): Promise<Omit<User, 'password_hash'>[]> {
  const result = await query(
    'SELECT user_id, username, role, created_at FROM Users ORDER BY created_at DESC, user_id DESC'
  );
  return result.rows;
}

export async function countAdmins(): Promise<number> {
  const result = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM Users WHERE role = 'Admin'`);
  return result.rows[0].count;
}

export async function deleteUser(userId: number): Promise<void> {
  await query('DELETE FROM Users WHERE user_id = $1', [userId]);
}

// ============================================
// NETWORK ASSET QUERIES
// ============================================
export async function getAllAssets(): Promise<NetworkAsset[]> {
  const result = await query<NetworkAsset>(
    'SELECT * FROM Network_Assets ORDER BY criticality DESC, internal_ip'
  );
  return result.rows;
}

export async function getAssetById(assetId: number): Promise<NetworkAsset | null> {
  const result = await query<NetworkAsset>('SELECT * FROM Network_Assets WHERE asset_id = $1', [assetId]);
  return result.rows[0] || null;
}

export async function createAsset(data: {
  internalIp: string;
  hostname?: string;
  criticality: number;
  department?: string;
}): Promise<NetworkAsset> {
  const result = await query<NetworkAsset>(
    `INSERT INTO Network_Assets (internal_ip, hostname, criticality, department)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.internalIp, data.hostname || null, data.criticality, data.department || null]
  );
  return result.rows[0];
}

export async function updateAssetCriticality(assetId: number, newCriticality: number): Promise<void> {
  await query('UPDATE Network_Assets SET criticality = $1 WHERE asset_id = $2', [newCriticality, assetId]);
}

// ============================================
// TRAFFIC LOG QUERIES
// ============================================
export async function createTrafficLog(data: {
  attackerIp: string;
  targetId: number;
  status: 'Allowed' | 'Blocked' | 'Failed';
  protocol?: string;
  port?: number;
  bytesTransferred?: number;
}): Promise<TrafficLog> {
  const result = await query<TrafficLog>(
    `INSERT INTO Traffic_Logs (attacker_ip, target_id, status, protocol, port, bytes_transferred)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.attackerIp, data.targetId, data.status, data.protocol || null, data.port ?? null, data.bytesTransferred ?? 0]
  );
  return result.rows[0];
}

export async function getTrafficLogs(filters: {
  attackerIp?: string;
  targetId?: number;
  status?: 'Allowed' | 'Blocked' | 'Failed';
  protocol?: string;
  port?: number;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}): Promise<PaginatedResponse<TrafficLogWithAsset>> {
  const where = new WhereBuilder()
    .add('tl.attacker_ip = ?', filters.attackerIp)
    .add('tl.target_id = ?', filters.targetId)
    .add('tl.status = ?', filters.status)
    .add('tl.protocol = ?', filters.protocol)
    .add('tl.port = ?', filters.port)
    .add('tl.timestamp >= ?', filters.dateFrom)
    .add('tl.timestamp <= ?', filters.dateTo);

  const offset = (filters.page - 1) * filters.pageSize;
  const n = where.params.length;

  // Count and page are independent: run them concurrently on two pooled connections.
  const [total, dataResult] = await Promise.all([
    countRows('Traffic_Logs', 'tl', where),
    query<TrafficLogWithAsset>(
      `SELECT tl.*, ${ASSET_COLUMNS}
       FROM Traffic_Logs tl
       JOIN Network_Assets na ON tl.target_id = na.asset_id
       ${where.clause}
       ORDER BY tl.timestamp DESC, tl.log_id DESC
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...where.params, filters.pageSize, offset]
    ),
  ]);

  return pageOf(dataResult.rows, total, filters.page, filters.pageSize);
}

export async function getTrafficLogsByAttackerIp(attackerIp: string, limit = 50): Promise<TrafficLogWithAsset[]> {
  const result = await query<TrafficLogWithAsset>(
    `SELECT tl.*, ${ASSET_COLUMNS}
     FROM Traffic_Logs tl
     JOIN Network_Assets na ON tl.target_id = na.asset_id
     WHERE tl.attacker_ip = $1
     ORDER BY tl.timestamp DESC
     LIMIT $2`,
    [attackerIp, limit]
  );
  return result.rows;
}

export async function deleteOldTrafficLogs(olderThanDays: number): Promise<number> {
  // The old `INTERVAL '$1 days'` put the placeholder inside a string literal,
  // where Postgres never substitutes it -> syntax error every time.
  const result = await query(
    `DELETE FROM Traffic_Logs WHERE timestamp < NOW() - make_interval(days => $1)`,
    [olderThanDays]
  );
  return result.rowCount || 0;
}

// ============================================
// INCIDENT QUERIES
// ============================================
export async function getIncidents(filters: {
  status?: 'Active' | 'Resolved';
  attackerIp?: string;
  targetId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}): Promise<PaginatedResponse<IncidentWithAsset>> {
  const where = new WhereBuilder()
    .add('i.status = ?', filters.status)
    .add('i.attacker_ip = ?', filters.attackerIp)
    .add('i.target_id = ?', filters.targetId)
    .add('i.created_at >= ?', filters.dateFrom)
    .add('i.created_at <= ?', filters.dateTo);

  const offset = (filters.page - 1) * filters.pageSize;
  const n = where.params.length;

  const [total, dataResult] = await Promise.all([
    countRows('Incidents', 'i', where),
    query<IncidentWithAsset>(
      `SELECT i.*, ${ASSET_COLUMNS}
       FROM Incidents i
       JOIN Network_Assets na ON i.target_id = na.asset_id
       ${where.clause}
       ORDER BY i.created_at DESC, i.incident_id DESC
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...where.params, filters.pageSize, offset]
    ),
  ]);

  return pageOf(dataResult.rows, total, filters.page, filters.pageSize);
}

export async function getIncidentById(incidentId: number): Promise<IncidentWithAsset | null> {
  const result = await query<IncidentWithAsset>(
    `SELECT i.*, ${ASSET_COLUMNS}
     FROM Incidents i
     JOIN Network_Assets na ON i.target_id = na.asset_id
     WHERE i.incident_id = $1`,
    [incidentId]
  );
  return result.rows[0] || null;
}

/** Atomic (single DB function): status update + criticality decrement + audit row. */
export async function resolveIncident(incidentId: number, userId: number, notes?: string): Promise<void> {
  await query('SELECT resolve_incident($1, $2, $3)', [incidentId, userId, notes || null]);
}

// ============================================
// AUDIT LOG QUERIES
// ============================================
interface AuditFilters {
  userId?: number;
  action?: string;
  incidentId?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

function auditWhere(filters: AuditFilters) {
  return new WhereBuilder()
    .add('al.user_id = ?', filters.userId)
    .add('al.action = ?', filters.action)
    .add('al.incident_id = ?', filters.incidentId)
    .add('al.created_at >= ?', filters.dateFrom)
    .add('al.created_at <= ?', filters.dateTo);
}

const AUDIT_SELECT = `
  SELECT al.*,
         i.attacker_ip AS incident_attacker_ip,
         i.status      AS incident_status,
         u.username    AS user_username,
         u.role        AS user_role
  FROM Audit_Logs al
  JOIN Incidents i ON al.incident_id = i.incident_id
  JOIN Users u     ON al.user_id = u.user_id`;

export async function getAuditLogs(
  filters: AuditFilters & { page: number; pageSize: number }
): Promise<PaginatedResponse<AuditLogWithRelations>> {
  const where = auditWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;
  const n = where.params.length;

  const [total, dataResult] = await Promise.all([
    countRows('Audit_Logs', 'al', where),
    query<AuditLogWithRelations>(
      `${AUDIT_SELECT} ${where.clause}
       ORDER BY al.created_at DESC, al.audit_id DESC
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...where.params, filters.pageSize, offset]
    ),
  ]);

  return pageOf(dataResult.rows, total, filters.page, filters.pageSize);
}

/** CSV export: capped, not paginated. */
export async function getAuditLogsForExport(filters: AuditFilters, limit = 10_000): Promise<AuditLogWithRelations[]> {
  const where = auditWhere(filters);
  const result = await query<AuditLogWithRelations>(
    `${AUDIT_SELECT} ${where.clause}
     ORDER BY al.created_at DESC, al.audit_id DESC
     LIMIT $${where.params.length + 1}`,
    [...where.params, limit]
  );
  return result.rows;
}

// ============================================
// SECURITY PLAYBOOK QUERIES
// ============================================
// Never `SELECT *` here: the 384-float vector would be serialised into every response.
const PLAYBOOK_COLUMNS = 'playbook_id, title, threat_category, description, mitigation, tags, created_at';

export async function searchPlaybooksByVector(embedding: number[], limit = 3): Promise<PlaybookSearchResult[]> {
  const result = await query<PlaybookSearchResult>(
    `SELECT ${PLAYBOOK_COLUMNS},
            1 - (vector <=> $1::vector) AS similarity
     FROM Security_Playbooks
     WHERE vector IS NOT NULL
     ORDER BY vector <=> $1::vector
     LIMIT $2`,
    [embeddingToPgVector(embedding), limit]
  );
  return result.rows;
}

export async function getAllPlaybooks(): Promise<PlaybookSummary[]> {
  const result = await query<PlaybookSummary>(
    `SELECT ${PLAYBOOK_COLUMNS} FROM Security_Playbooks ORDER BY created_at DESC, playbook_id DESC`
  );
  return result.rows;
}

// ============================================
// BLAST RADIUS
// ============================================
export async function computeBlastRadius(assetId: number): Promise<BlastRadiusResult | null> {
  const exists = await getAssetById(assetId);
  if (!exists) return null;
  const result = await query<BlastRadiusResult>('SELECT * FROM compute_blast_radius($1)', [assetId]);
  return result.rows[0] || { affected_asset_count: 0, max_criticality: 0, risk_score: 0 };
}

// ============================================
// SYSTEM STATS
// ============================================
// The dashboard fired 7 separate queries (each a table scan) per page view.
// One round-trip, plus a short cache so a burst of refreshes costs one query.
const STATS_TTL_MS = 5_000;
let statsCache: { at: number; value: SystemStats } | null = null;
let statsInFlight: Promise<SystemStats> | null = null;

export async function getSystemStats(): Promise<SystemStats> {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL_MS) return statsCache.value;
  // De-duplicate concurrent requests while a refresh is already running.
  statsInFlight ??= loadSystemStats().finally(() => {
    statsInFlight = null;
  });
  return statsInFlight;
}

async function loadSystemStats(): Promise<SystemStats> {
  const result = await query<SystemStats>(`
    SELECT
      (SELECT COUNT(*) FROM Incidents)                                         AS total_incidents,
      (SELECT COUNT(*) FROM Incidents WHERE status = 'Active')                 AS active_incidents,
      (SELECT COUNT(*) FROM Incidents WHERE status = 'Resolved')               AS resolved_incidents,
      (SELECT COUNT(*) FROM Traffic_Logs)                                      AS total_traffic_logs,
      (SELECT COUNT(*) FROM Traffic_Logs WHERE timestamp > NOW() - INTERVAL '1 hour') AS logs_last_hour,
      (SELECT COUNT(DISTINCT attacker_ip) FROM Traffic_Logs)                   AS unique_attackers,
      (SELECT COUNT(*) FROM Network_Assets WHERE criticality >= 8)             AS critical_assets
  `);
  const value = result.rows[0];
  statsCache = { at: Date.now(), value };
  return value;
}

import { query } from '@/lib/db';
import { embedText, embeddingToPgVector, playbookEmbeddingText } from '@/lib/embeddings';
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
  AssetConnectionWithNames,
  ReachableAsset,
  SecurityAnalytics,
  TopAttacker,
  DepartmentIncidentStats,
  AboveAverageAttacker,
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
  const result = await query<Omit<User, 'password_hash'>>(
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

/** Partial update: only the fields that were sent are changed. */
export async function updateAsset(
  assetId: number,
  data: { hostname?: string | null; criticality?: number; department?: string | null }
): Promise<NetworkAsset | null> {
  const result = await query<NetworkAsset>(
    `UPDATE Network_Assets
     SET hostname    = CASE WHEN $2 THEN $3 ELSE hostname END,
         criticality = COALESCE($4, criticality),
         department  = CASE WHEN $5 THEN $6 ELSE department END
     WHERE asset_id = $1
     RETURNING *`,
    [
      assetId,
      data.hostname !== undefined, data.hostname || null,
      data.criticality ?? null,
      data.department !== undefined, data.department || null,
    ]
  );
  return result.rows[0] || null;
}

/** Fails with 23503 (-> 409) while traffic logs or incidents still reference the asset. */
export async function deleteAsset(assetId: number): Promise<boolean> {
  const result = await query('DELETE FROM Network_Assets WHERE asset_id = $1', [assetId]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================
// ASSET CONNECTIONS (topology) + RECURSIVE QUERY
// ============================================
export async function getAssetConnections(): Promise<AssetConnectionWithNames[]> {
  const result = await query<AssetConnectionWithNames>(
    `SELECT c.*,
            s.hostname AS src_hostname, s.internal_ip AS src_ip,
            d.hostname AS dst_hostname, d.internal_ip AS dst_ip
     FROM Asset_Connections c
     JOIN Network_Assets s ON s.asset_id = c.src_asset_id
     JOIN Network_Assets d ON d.asset_id = c.dst_asset_id
     ORDER BY s.hostname, d.hostname`
  );
  return result.rows;
}

export async function createAssetConnection(srcId: number, dstId: number, type: string) {
  const result = await query(
    `INSERT INTO Asset_Connections (src_asset_id, dst_asset_id, connection_type)
     VALUES ($1, $2, $3) RETURNING *`,
    [srcId, dstId, type]
  );
  return result.rows[0];
}

export async function deleteAssetConnection(srcId: number, dstId: number): Promise<boolean> {
  const result = await query(
    'DELETE FROM Asset_Connections WHERE src_asset_id = $1 AND dst_asset_id = $2',
    [srcId, dstId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** WITH RECURSIVE: every asset reachable from `assetId` (see get_reachable_assets in schema.sql). */
export async function getReachableAssets(assetId: number, maxHops = 5): Promise<ReachableAsset[]> {
  const result = await query<ReachableAsset>('SELECT * FROM get_reachable_assets($1, $2)', [assetId, maxHops]);
  return result.rows;
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

/** Stored PROCEDURE, run with CALL. Moves old logs into Traffic_Logs_Archive. */
export async function archiveOldTrafficLogs(olderThanDays: number): Promise<number> {
  const result = await query<{ p_archived: number }>('CALL archive_old_logs($1::int, NULL)', [olderThanDays]);
  return result.rows[0]?.p_archived ?? 0;
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

export async function getPlaybookById(playbookId: number): Promise<PlaybookSummary | null> {
  const result = await query<PlaybookSummary>(
    `SELECT ${PLAYBOOK_COLUMNS} FROM Security_Playbooks WHERE playbook_id = $1`,
    [playbookId]
  );
  return result.rows[0] || null;
}

/** Free-text similarity search: embed the text, then nearest neighbours by cosine distance. */
export async function searchPlaybooksByText(text: string, limit = 5): Promise<PlaybookSearchResult[]> {
  return searchPlaybooksByVector(embedText(text), limit);
}

export interface PlaybookInput {
  title: string;
  threat_category?: string | null;
  description: string;
  mitigation: string;
  tags?: string[] | null;
}

/** CREATE: the vector is computed here and stored with the row (duplicate title -> 23505 -> 409). */
export async function createPlaybook(data: PlaybookInput): Promise<PlaybookSummary> {
  const vector = embeddingToPgVector(embedText(playbookEmbeddingText(data)));
  const result = await query<PlaybookSummary>(
    `INSERT INTO Security_Playbooks (title, threat_category, description, mitigation, tags, vector)
     VALUES ($1, $2, $3, $4, $5, $6::vector)
     RETURNING ${PLAYBOOK_COLUMNS}`,
    [data.title, data.threat_category || null, data.description, data.mitigation, data.tags ?? null, vector]
  );
  return result.rows[0];
}

/**
 * UPDATE: the text changed, so the stored vector is stale. Merge the new
 * fields over the current row and RE-EMBED, written in one statement.
 */
export async function updatePlaybook(playbookId: number, data: Partial<PlaybookInput>): Promise<PlaybookSummary | null> {
  const current = await getPlaybookById(playbookId);
  if (!current) return null;
  const merged: PlaybookInput = {
    title: data.title ?? current.title,
    threat_category: data.threat_category !== undefined ? data.threat_category : current.threat_category,
    description: data.description ?? current.description,
    mitigation: data.mitigation ?? current.mitigation,
    tags: data.tags !== undefined ? data.tags : current.tags,
  };
  const vector = embeddingToPgVector(embedText(playbookEmbeddingText(merged)));
  const result = await query<PlaybookSummary>(
    `UPDATE Security_Playbooks
     SET title = $2, threat_category = $3, description = $4, mitigation = $5, tags = $6, vector = $7::vector
     WHERE playbook_id = $1
     RETURNING ${PLAYBOOK_COLUMNS}`,
    [playbookId, merged.title, merged.threat_category || null, merged.description, merged.mitigation, merged.tags ?? null, vector]
  );
  return result.rows[0] || null;
}

/** DELETE: the row and its vector go together (the HNSW index updates itself). */
export async function deletePlaybook(playbookId: number): Promise<boolean> {
  const result = await query('DELETE FROM Security_Playbooks WHERE playbook_id = $1', [playbookId]);
  return (result.rowCount ?? 0) > 0;
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

// ============================================
// SECURITY ANALYTICS
//   GROUP BY / HAVING, and a CORRELATED subquery.
// ============================================
export async function getSecurityAnalytics(): Promise<SecurityAnalytics> {
  const [topAttackers, byDepartment, aboveAverage] = await Promise.all([
    // GROUP BY + HAVING: sources with at least 3 failed attempts
    query<TopAttacker>(
      `SELECT tl.attacker_ip,
              COUNT(*)                                     AS total_attempts,
              COUNT(*) FILTER (WHERE tl.status = 'Failed') AS failed_attempts,
              COUNT(DISTINCT tl.target_id)                 AS targets_hit,
              MAX(tl.timestamp)                            AS last_seen
       FROM Traffic_Logs tl
       GROUP BY tl.attacker_ip
       HAVING COUNT(*) FILTER (WHERE tl.status = 'Failed') >= 3
       ORDER BY failed_attempts DESC, total_attempts DESC
       LIMIT 10`
    ),
    // JOIN + GROUP BY: incident load per department
    query<DepartmentIncidentStats>(
      `SELECT COALESCE(na.department, 'Unassigned')         AS department,
              COUNT(*)                                      AS total_incidents,
              COUNT(*) FILTER (WHERE i.status = 'Active')   AS active_incidents,
              COUNT(*) FILTER (WHERE i.status = 'Resolved') AS resolved_incidents,
              ROUND(AVG(i.blast_radius_score)::numeric, 1)  AS avg_blast_radius
       FROM Incidents i
       JOIN Network_Assets na ON na.asset_id = i.target_id
       GROUP BY COALESCE(na.department, 'Unassigned')
       ORDER BY total_incidents DESC, department`
    ),
    // CORRELATED subquery: the inner SELECT refers to the outer row's
    // p.target_id, so it is evaluated once per outer row: "who attacked this
    // target at least as hard as the average attacker of THIS target?"
    query<AboveAverageAttacker>(
      `WITH per_pair AS (
         SELECT attacker_ip, target_id, COUNT(*) AS failed_attempts
         FROM Traffic_Logs
         WHERE status = 'Failed'
         GROUP BY attacker_ip, target_id
       )
       SELECT p.attacker_ip,
              p.target_id,
              na.hostname AS target_hostname,
              p.failed_attempts,
              (SELECT ROUND(AVG(p2.failed_attempts)::numeric, 2)
                 FROM per_pair p2
                WHERE p2.target_id = p.target_id) AS target_avg_failed
       FROM per_pair p
       JOIN Network_Assets na ON na.asset_id = p.target_id
       WHERE p.failed_attempts >= (SELECT AVG(p2.failed_attempts)
                                     FROM per_pair p2
                                    WHERE p2.target_id = p.target_id)
       ORDER BY p.failed_attempts DESC
       LIMIT 10`
    ),
  ]);
  return {
    top_attackers: topAttackers.rows,
    incidents_by_department: byDepartment.rows,
    above_average_attackers: aboveAverage.rows,
  };
}

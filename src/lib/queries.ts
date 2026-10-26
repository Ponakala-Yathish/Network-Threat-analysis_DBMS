import { query, transaction } from '@/lib/db';
import type {
  User,
  NetworkAsset,
  TrafficLog,
  Incident,
  AuditLog,
  SecurityPlaybook,
  IncidentWithAsset,
  TrafficLogWithAsset,
  AuditLogWithRelations,
  BlastRadiusResult,
  PlaybookSearchResult,
  SystemStats,
  PaginatedResponse,
} from '@/types/database';

// ============================================
// USER QUERIES
// ============================================
export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query(
    'SELECT * FROM Users WHERE username = $1',
    [username]
  );
  return result.rows[0] || null;
}

export async function getUserById(userId: number): Promise<User | null> {
  const result = await query(
    'SELECT * FROM Users WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function createUser(
  username: string,
  passwordHash: string,
  role: 'Admin' | 'Analyst'
): Promise<User> {
  const result = await query(
    `INSERT INTO Users (username, password_hash, role) 
     VALUES ($1, $2, $3) 
     RETURNING *`,
    [username, passwordHash, role]
  );
  return result.rows[0];
}

export async function getAllUsers(): Promise<User[]> {
  const result = await query(
    'SELECT user_id, username, role, created_at FROM Users ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function deleteUser(userId: number): Promise<void> {
  await query('DELETE FROM Users WHERE user_id = $1', [userId]);
}

// ============================================
// NETWORK ASSET QUERIES
// ============================================
export async function getAllAssets(): Promise<NetworkAsset[]> {
  const result = await query(
    'SELECT * FROM Network_Assets ORDER BY criticality DESC, internal_ip'
  );
  return result.rows;
}

export async function getAssetById(assetId: number): Promise<NetworkAsset | null> {
  const result = await query(
    'SELECT * FROM Network_Assets WHERE asset_id = $1',
    [assetId]
  );
  return result.rows[0] || null;
}

export async function createAsset(data: {
  internalIp: string;
  hostname?: string;
  criticality: number;
  department?: string;
}): Promise<NetworkAsset> {
  const result = await query(
    `INSERT INTO Network_Assets (internal_ip, hostname, criticality, department)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.internalIp, data.hostname || null, data.criticality, data.department || null]
  );
  return result.rows[0];
}

export async function updateAssetCriticality(assetId: number, newCriticality: number): Promise<void> {
  await query(
    'UPDATE Network_Assets SET criticality = $1 WHERE asset_id = $2',
    [newCriticality, assetId]
  );
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
  const result = await query(
    `INSERT INTO Traffic_Logs (attacker_ip, target_id, status, protocol, port, bytes_transferred)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.attackerIp, data.targetId, data.status, data.protocol || null, data.port || null, data.bytesTransferred || 0]
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
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.attackerIp) {
    conditions.push(`tl.attacker_ip = $${paramIndex++}`);
    params.push(filters.attackerIp);
  }
  if (filters.targetId) {
    conditions.push(`tl.target_id = $${paramIndex++}`);
    params.push(filters.targetId);
  }
  if (filters.status) {
    conditions.push(`tl.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.protocol) {
    conditions.push(`tl.protocol = $${paramIndex++}`);
    params.push(filters.protocol);
  }
  if (filters.port) {
    conditions.push(`tl.port = $${paramIndex++}`);
    params.push(filters.port);
  }
  if (filters.dateFrom) {
    conditions.push(`tl.timestamp >= $${paramIndex++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`tl.timestamp <= $${paramIndex++}`);
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countResult = await query(
    `SELECT COUNT(*) FROM Traffic_Logs tl ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  // Get paginated data
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(filters.pageSize, offset);
  
  const dataResult = await query(
    `SELECT 
      tl.*, 
      na.internal_ip AS target_ip,
      na.hostname AS target_hostname,
      na.criticality AS asset_criticality,
      na.department AS asset_department
     FROM Traffic_Logs tl
     JOIN Network_Assets na ON tl.target_id = na.asset_id
     ${whereClause}
     ORDER BY tl.timestamp DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return {
    data: dataResult.rows,
    total,
    page: filters.page,
    page_size: filters.pageSize,
    total_pages: Math.ceil(total / filters.pageSize),
  };
}

export async function getTrafficLogsByAttackerIp(attackerIp: string, limit = 50): Promise<TrafficLogWithAsset[]> {
  const result = await query(
    `SELECT 
      tl.*, 
      na.internal_ip AS target_ip,
      na.hostname AS target_hostname,
      na.criticality AS asset_criticality,
      na.department AS asset_department
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
  const result = await query(
    `DELETE FROM Traffic_Logs WHERE timestamp < NOW() - INTERVAL '$1 days'`,
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
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`i.status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.attackerIp) {
    conditions.push(`i.attacker_ip = $${paramIndex++}`);
    params.push(filters.attackerIp);
  }
  if (filters.targetId) {
    conditions.push(`i.target_id = $${paramIndex++}`);
    params.push(filters.targetId);
  }
  if (filters.dateFrom) {
    conditions.push(`i.created_at >= $${paramIndex++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`i.created_at <= $${paramIndex++}`);
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM Incidents i ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const offset = (filters.page - 1) * filters.pageSize;
  params.push(filters.pageSize, offset);
  
  const dataResult = await query(
    `SELECT 
      i.*, 
      na.internal_ip AS target_ip,
      na.hostname AS target_hostname,
      na.criticality AS asset_criticality,
      na.department AS asset_department
     FROM Incidents i
     JOIN Network_Assets na ON i.target_id = na.asset_id
     ${whereClause}
     ORDER BY i.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return {
    data: dataResult.rows,
    total,
    page: filters.page,
    page_size: filters.pageSize,
    total_pages: Math.ceil(total / filters.pageSize),
  };
}

export async function getIncidentById(incidentId: number): Promise<IncidentWithAsset | null> {
  const result = await query(
    `SELECT 
      i.*, 
      na.internal_ip AS target_ip,
      na.hostname AS target_hostname,
      na.criticality AS asset_criticality,
      na.department AS asset_department
     FROM Incidents i
     JOIN Network_Assets na ON i.target_id = na.asset_id
     WHERE i.incident_id = $1`,
    [incidentId]
  );
  return result.rows[0] || null;
}

export async function resolveIncident(
  incidentId: number,
  userId: number,
  notes?: string
): Promise<void> {
  await query('SELECT resolve_incident($1, $2, $3)', [incidentId, userId, notes || null]);
}

// ============================================
// AUDIT LOG QUERIES
// ============================================
export async function getAuditLogs(filters: {
  userId?: number;
  action?: string;
  incidentId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}): Promise<PaginatedResponse<AuditLogWithRelations>> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`al.user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }
  if (filters.action) {
    conditions.push(`al.action = $${paramIndex++}`);
    params.push(filters.action);
  }
  if (filters.incidentId) {
    conditions.push(`al.incident_id = $${paramIndex++}`);
    params.push(filters.incidentId);
  }
  if (filters.dateFrom) {
    conditions.push(`al.created_at >= $${paramIndex++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`al.created_at <= $${paramIndex++}`);
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM Audit_Logs al ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const offset = (filters.page - 1) * filters.pageSize;
  params.push(filters.pageSize, offset);
  
  const dataResult = await query(
    `SELECT 
      al.*, 
      i.attacker_ip AS incident_attacker_ip,
      i.status AS incident_status,
      u.username AS user_username,
      u.role AS user_role
     FROM Audit_Logs al
     JOIN Incidents i ON al.incident_id = i.incident_id
     JOIN Users u ON al.user_id = u.user_id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return {
    data: dataResult.rows,
    total,
    page: filters.page,
    page_size: filters.pageSize,
    total_pages: Math.ceil(total / filters.pageSize),
  };
}

// ============================================
// SECURITY PLAYBOOK QUERIES
// ============================================
export async function searchPlaybooksByVector(
  embedding: number[],
  limit = 3
): Promise<PlaybookSearchResult[]> {
  const vectorStr = `[${embedding.join(',')}]`;
  const result = await query(
    `SELECT 
      *, 
      1 - (vector <=> $1::vector) AS similarity
     FROM Security_Playbooks
     WHERE vector IS NOT NULL
     ORDER BY vector <=> $1::vector
     LIMIT $2`,
    [vectorStr, limit]
  );
  return result.rows;
}

export async function getAllPlaybooks(): Promise<SecurityPlaybook[]> {
  const result = await query(
    'SELECT * FROM Security_Playbooks ORDER BY created_at DESC'
  );
  return result.rows;
}

// ============================================
// BLAST RADIUS QUERY
// ============================================
export async function computeBlastRadius(assetId: number): Promise<BlastRadiusResult> {
  const result = await query(
    'SELECT * FROM compute_blast_radius($1)',
    [assetId]
  );
  return result.rows[0] || { affected_asset_count: 0, max_criticality: 0, risk_score: 0 };
}

// ============================================
// SYSTEM STATS
// ============================================
export async function getSystemStats(): Promise<SystemStats> {
  const [
    totalIncidents,
    activeIncidents,
    resolvedIncidents,
    totalTrafficLogs,
    logsLastHour,
    uniqueAttackers,
    criticalAssets,
  ] = await Promise.all([
    query('SELECT COUNT(*) FROM Incidents'),
    query("SELECT COUNT(*) FROM Incidents WHERE status = 'Active'"),
    query("SELECT COUNT(*) FROM Incidents WHERE status = 'Resolved'"),
    query('SELECT COUNT(*) FROM Traffic_Logs'),
    query("SELECT COUNT(*) FROM Traffic_Logs WHERE timestamp > NOW() - INTERVAL '1 hour'"),
    query('SELECT COUNT(DISTINCT attacker_ip) FROM Traffic_Logs'),
    query('SELECT COUNT(*) FROM Network_Assets WHERE criticality >= 8'),
  ]);

  return {
    total_incidents: parseInt(totalIncidents.rows[0].count),
    active_incidents: parseInt(activeIncidents.rows[0].count),
    resolved_incidents: parseInt(resolvedIncidents.rows[0].count),
    total_traffic_logs: parseInt(totalTrafficLogs.rows[0].count),
    logs_last_hour: parseInt(logsLastHour.rows[0].count),
    unique_attackers: parseInt(uniqueAttackers.rows[0].count),
    critical_assets: parseInt(criticalAssets.rows[0].count),
  };
}
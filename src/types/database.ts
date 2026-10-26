export type UserRole = 'Admin' | 'Analyst';

export interface User {
  user_id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
}

export interface NetworkAsset {
  asset_id: number;
  internal_ip: string;
  hostname: string | null;
  criticality: number;
  department: string | null;
  created_at: Date;
}

export type TrafficStatus = 'Allowed' | 'Blocked' | 'Failed';

export interface TrafficLog {
  log_id: number;
  attacker_ip: string;
  target_id: number;
  status: TrafficStatus;
  protocol: string | null;
  port: number | null;
  bytes_transferred: number;
  timestamp: Date;
}

export type IncidentStatus = 'Active' | 'Resolved';

export interface Incident {
  incident_id: number;
  attacker_ip: string;
  target_id: number;
  status: IncidentStatus;
  description: string | null;
  blast_radius_score: number;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by: number | null;
}

export interface AuditLog {
  audit_id: number;
  incident_id: number;
  user_id: number;
  action: string;
  old_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: Date;
}

export interface SecurityPlaybook {
  playbook_id: number;
  title: string;
  threat_category: string | null;
  description: string;
  mitigation: string;
  vector: number[] | null;
  tags: string[] | null;
  created_at: Date;
}

export interface IncidentWithAsset extends Incident {
  asset: NetworkAsset;
}

export interface TrafficLogWithAsset extends TrafficLog {
  asset: NetworkAsset;
}

export interface AuditLogWithRelations extends AuditLog {
  incident: Incident;
  user: User;
  incident_attacker_ip: string;
  incident_status: string;
  user_username: string;
  user_role: string;
}

export interface BlastRadiusResult {
  affected_asset_count: number;
  max_criticality: number;
  risk_score: number;
}

export interface PlaybookSearchResult extends SecurityPlaybook {
  similarity: number;
}

export interface SystemStats {
  total_incidents: number;
  active_incidents: number;
  resolved_incidents: number;
  total_traffic_logs: number;
  logs_last_hour: number;
  unique_attackers: number;
  critical_assets: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode: number;
}
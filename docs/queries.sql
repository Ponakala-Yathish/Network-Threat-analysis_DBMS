-- ============================================================================
-- Network Threat Intelligence Platform: SQL commands for the report
-- Run in psql after `npm run db:setup`:
--   psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/queries.sql
-- The DDL (tables, constraints, trigger, functions, procedure, roles) is in
-- src/db/schema.sql. This file shows them being USED.
-- ============================================================================

\echo '=== 1. DML: INSERT / UPDATE / DELETE ==='

INSERT INTO Network_Assets (internal_ip, hostname, criticality, department)
VALUES ('10.0.8.50', 'report-demo-host', 6, 'Research')
ON CONFLICT (internal_ip) DO NOTHING;

UPDATE Network_Assets
SET criticality = 7
WHERE internal_ip = '10.0.8.50';

INSERT INTO Asset_Connections (src_asset_id, dst_asset_id, connection_type)
SELECT s.asset_id, d.asset_id, 'network'
FROM Network_Assets s, Network_Assets d
WHERE s.internal_ip = '10.0.8.50' AND d.internal_ip = '10.0.1.20'
ON CONFLICT DO NOTHING;

DELETE FROM Asset_Connections
WHERE src_asset_id = (SELECT asset_id FROM Network_Assets WHERE internal_ip = '10.0.8.50');

DELETE FROM Network_Assets WHERE internal_ip = '10.0.8.50';


\echo '=== 2. JOIN (3 tables): audit trail with incident and user ==='

SELECT al.audit_id, al.action, al.old_status, al.new_status,
       host(i.attacker_ip) AS attacker, u.username, al.created_at
FROM Audit_Logs al
JOIN Incidents i ON i.incident_id = al.incident_id
JOIN Users u     ON u.user_id     = al.user_id
ORDER BY al.created_at DESC
LIMIT 10;


\echo '=== 3. NESTED subquery (IN): assets hit by any IP that has an open incident ==='

SELECT asset_id, hostname, criticality
FROM Network_Assets
WHERE asset_id IN (
    SELECT DISTINCT target_id
    FROM Traffic_Logs
    WHERE attacker_ip IN (SELECT attacker_ip FROM Incidents WHERE status = 'Active')
);


\echo '=== 4. CORRELATED subquery: attackers at or above their target''s average ==='
-- The inner SELECT uses p.target_id from the OUTER row, so it is evaluated per row.

WITH per_pair AS (
    SELECT attacker_ip, target_id, COUNT(*) AS failed_attempts
    FROM Traffic_Logs
    WHERE status = 'Failed'
    GROUP BY attacker_ip, target_id
)
SELECT host(p.attacker_ip) AS attacker, na.hostname AS target, p.failed_attempts,
       (SELECT ROUND(AVG(p2.failed_attempts), 2)
          FROM per_pair p2 WHERE p2.target_id = p.target_id) AS target_avg
FROM per_pair p
JOIN Network_Assets na ON na.asset_id = p.target_id
WHERE p.failed_attempts >= (SELECT AVG(p2.failed_attempts)
                              FROM per_pair p2 WHERE p2.target_id = p.target_id)
ORDER BY p.failed_attempts DESC;

-- A second correlated example with NOT EXISTS: critical assets never attacked
SELECT na.hostname, na.criticality
FROM Network_Assets na
WHERE na.criticality >= 8
  AND NOT EXISTS (SELECT 1 FROM Traffic_Logs tl WHERE tl.target_id = na.asset_id);


\echo '=== 5. GROUP BY / HAVING: sources with 3+ failed attempts ==='

SELECT host(attacker_ip) AS attacker,
       COUNT(*)                                  AS total_attempts,
       COUNT(*) FILTER (WHERE status = 'Failed') AS failed_attempts,
       COUNT(DISTINCT target_id)                 AS targets_hit
FROM Traffic_Logs
GROUP BY attacker_ip
HAVING COUNT(*) FILTER (WHERE status = 'Failed') >= 3
ORDER BY failed_attempts DESC;

-- Incidents per department (JOIN + GROUP BY)
SELECT COALESCE(na.department, 'Unassigned') AS department,
       COUNT(*) AS incidents,
       COUNT(*) FILTER (WHERE i.status = 'Active') AS active,
       ROUND(AVG(i.blast_radius_score), 1) AS avg_blast_radius
FROM Incidents i
JOIN Network_Assets na ON na.asset_id = i.target_id
GROUP BY COALESCE(na.department, 'Unassigned')
ORDER BY incidents DESC;


\echo '=== 6. RECURSIVE CTE: lateral movement from workstation-engineering ==='

-- Written out in full (the same query lives in get_reachable_assets()):
WITH RECURSIVE reach(asset_id, hops, path) AS (
    SELECT asset_id, 0, ARRAY[asset_id]
    FROM Network_Assets WHERE hostname = 'workstation-engineering'
    UNION ALL
    SELECT c.dst_asset_id, r.hops + 1, r.path || c.dst_asset_id
    FROM reach r
    JOIN Asset_Connections c ON c.src_asset_id = r.asset_id
    WHERE r.hops < 5
      AND NOT (c.dst_asset_id = ANY(r.path))      -- cycle guard
)
SELECT DISTINCT ON (r.asset_id) na.hostname, r.hops
FROM reach r
JOIN Network_Assets na ON na.asset_id = r.asset_id
ORDER BY r.asset_id, r.hops;

-- Through the function (adds the readable path):
SELECT r.hops, r.hostname, r.criticality, r.path
FROM Network_Assets n, get_reachable_assets(n.asset_id, 5) r
WHERE n.hostname = 'workstation-engineering';


\echo '=== 7. FUNCTION: compute_blast_radius ==='

SELECT b.*
FROM Network_Assets n, compute_blast_radius(n.asset_id) b
WHERE n.hostname = 'db-primary';


\echo '=== 8. TRIGGER: 6 failed logins in a row open ONE incident ==='

INSERT INTO Traffic_Logs (attacker_ip, target_id, status, protocol, port)
SELECT '192.168.1.100', asset_id, 'Failed', 'SSH', 22
FROM Network_Assets, generate_series(1, 6)
WHERE hostname = 'app-server-01';

SELECT incident_id, host(attacker_ip) AS attacker, status, blast_radius_score, description
FROM Incidents
WHERE attacker_ip = '192.168.1.100';


\echo '=== 9. FUNCTION with transaction + row lock: resolve_incident ==='

SELECT resolve_incident(
    (SELECT incident_id FROM Incidents WHERE attacker_ip = '192.168.1.100' AND status = 'Active'),
    (SELECT user_id FROM Users WHERE username = 'analyst'),
    'Blocked 192.168.1.100 at the perimeter firewall');

SELECT incident_id, status, resolved_at, resolved_by
FROM Incidents WHERE attacker_ip = '192.168.1.100';


\echo '=== 10. PROCEDURE: archive logs older than 30 days (CALL) ==='

CALL archive_old_logs(30, NULL);
SELECT COUNT(*) AS archived_rows FROM Traffic_Logs_Archive;


\echo '=== 11. VIEWS ==='

SELECT incident_id, host(attacker_ip) AS attacker, target_hostname, asset_criticality
FROM active_incidents_view;

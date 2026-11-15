-- ============================================================================
-- Role-based access control INSIDE PostgreSQL: demo for the report / viva
--   psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/rbac-demo.sql
--
-- Several statements below are SUPPOSED to fail with "permission denied".
-- That failure is the point: the database itself refuses them.
-- ============================================================================

\echo '=== Roles and memberships ==='
SELECT r.rolname, r.rolcanlogin AS can_login, r.rolinherit AS inherits,
       ARRAY(SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
             WHERE m.member = r.oid) AS member_of
FROM pg_roles r
WHERE r.rolname LIKE 'threat_%'
ORDER BY r.rolname;

\echo '=== Table privileges per role ==='
SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee IN ('threat_admin', 'threat_analyst', 'threat_auth')
GROUP BY grantee, table_name
ORDER BY grantee, table_name;

\echo '=== Row-level security policies ==='
SELECT tablename, policyname, roles, cmd, qual FROM pg_policies;


\echo ''
\echo '=== ANALYST: what the app does for a logged-in analyst ==='
-- Look up the analyst's id first (as postgres), then become the analyst.
SELECT set_config('app.user_id', (SELECT user_id::text FROM Users WHERE username = 'analyst'), false) AS app_user_id;
SET ROLE threat_analyst;
SELECT current_user;

\echo '-- allowed: read incidents'
SELECT COUNT(*) AS incidents FROM Incidents;

\echo '-- EXPECTED ERROR: permission denied for table users'
SELECT username FROM Users;

\echo '-- EXPECTED ERROR: analysts cannot delete playbooks'
DELETE FROM Security_Playbooks WHERE playbook_id = -1;

\echo '-- EXPECTED ERROR: analysts cannot run the archive procedure'
CALL archive_old_logs(30, NULL);

\echo '-- RLS: the analyst sees only the audit rows they wrote themselves'
SELECT audit_id, user_id, action, notes FROM Audit_Logs;

\echo '-- RLS: pretend to be user 0 -> no rows visible'
SELECT set_config('app.user_id', '0', false);
SELECT COUNT(*) AS visible_audit_rows FROM Audit_Logs;

RESET ROLE;
RESET app.user_id;


\echo ''
\echo '=== ADMIN ==='
SET ROLE threat_admin;
SELECT current_user;
SELECT COUNT(*) AS users FROM Users;
SELECT COUNT(*) AS all_audit_rows FROM Audit_Logs;
RESET ROLE;

-- Network Threat Intelligence Platform - Database Schema
-- PostgreSQL 15+ with pgvector (>= 0.5 for HNSW indexes)
--
-- This file is IDEMPOTENT: it can be run on an empty database or on top of an
-- older version of this schema (it upgrades in place). Run it with
-- `npm run db:migrate`, which executes the whole file in one transaction.

CREATE EXTENSION IF NOT EXISTS vector;

-- Views depend on column types, so drop them first; they are re-created at the
-- bottom of this file. (Lets the TIMESTAMPTZ upgrade below run on old databases.)
DROP VIEW IF EXISTS active_incidents_view;
DROP VIEW IF EXISTS traffic_logs_with_assets;

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS Users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('Admin', 'Analyst')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NETWORK ASSETS
-- ============================================
CREATE TABLE IF NOT EXISTS Network_Assets (
    asset_id    SERIAL PRIMARY KEY,
    internal_ip INET        UNIQUE NOT NULL,
    hostname    VARCHAR(100),
    criticality INTEGER     NOT NULL CHECK (criticality BETWEEN 1 AND 10),
    department  VARCHAR(50),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assets_department ON Network_Assets(department);

-- ============================================
-- TRAFFIC LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS Traffic_Logs (
    log_id            BIGSERIAL PRIMARY KEY,
    attacker_ip       INET        NOT NULL,
    target_id         INTEGER     NOT NULL REFERENCES Network_Assets(asset_id) ON DELETE RESTRICT,
    status            VARCHAR(20) NOT NULL CHECK (status IN ('Allowed', 'Blocked', 'Failed')),
    protocol          VARCHAR(20),
    port              INTEGER CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
    bytes_transferred BIGINT      NOT NULL DEFAULT 0 CHECK (bytes_transferred >= 0),
    timestamp         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traffic_logs_timestamp   ON Traffic_Logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_attacker_ip ON Traffic_Logs(attacker_ip, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_target_id   ON Traffic_Logs(target_id, attacker_ip);
-- Serves the brute-force trigger: "recent failed attempts from this IP"
CREATE INDEX IF NOT EXISTS idx_traffic_logs_failed
    ON Traffic_Logs(attacker_ip, timestamp DESC) WHERE status = 'Failed';
-- A 3-value column is useless as a standalone index
DROP INDEX IF EXISTS idx_traffic_logs_status;

-- ============================================
-- INCIDENTS
-- ============================================
CREATE TABLE IF NOT EXISTS Incidents (
    incident_id        BIGSERIAL PRIMARY KEY,
    attacker_ip        INET        NOT NULL,
    target_id          INTEGER     NOT NULL REFERENCES Network_Assets(asset_id) ON DELETE RESTRICT,
    status             VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Resolved')),
    description        TEXT,
    blast_radius_score INTEGER     NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at        TIMESTAMPTZ,
    resolved_by        INTEGER REFERENCES Users(user_id) ON DELETE SET NULL
);

-- Older versions of the trigger created one incident per failed log once the
-- threshold was crossed (ON CONFLICT had no unique index to conflict with).
-- Collapse those duplicates so the unique index below can be built.
DELETE FROM Incidents a
USING Incidents b
WHERE a.status = 'Active' AND b.status = 'Active'
  AND a.attacker_ip = b.attacker_ip
  AND a.target_id   = b.target_id
  AND a.incident_id > b.incident_id;

-- At most ONE active incident per (attacker, target). This is what makes the
-- trigger's ON CONFLICT DO NOTHING actually de-duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_active_pair
    ON Incidents(attacker_ip, target_id) WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_incidents_created_at  ON Incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_active      ON Incidents(created_at DESC) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_incidents_attacker_ip ON Incidents(attacker_ip);
CREATE INDEX IF NOT EXISTS idx_incidents_target_id   ON Incidents(target_id);
DROP INDEX IF EXISTS idx_incidents_status;

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS Audit_Logs (
    audit_id    BIGSERIAL PRIMARY KEY,
    incident_id BIGINT      NOT NULL REFERENCES Incidents(incident_id) ON DELETE RESTRICT,
    user_id     INTEGER     NOT NULL REFERENCES Users(user_id) ON DELETE RESTRICT,
    action      VARCHAR(50) NOT NULL,
    old_status  VARCHAR(20),
    new_status  VARCHAR(20),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_incident_id ON Audit_Logs(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON Audit_Logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON Audit_Logs(created_at DESC);

-- ============================================
-- SECURITY PLAYBOOKS
-- ============================================
CREATE TABLE IF NOT EXISTS Security_Playbooks (
    playbook_id     SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    threat_category VARCHAR(100),
    description     TEXT NOT NULL,
    mitigation      TEXT NOT NULL,
    vector          VECTOR(384),
    tags            TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Re-running the seed used to duplicate every playbook (no unique key existed).
DELETE FROM Security_Playbooks a
USING Security_Playbooks b
WHERE a.title = b.title AND a.playbook_id > b.playbook_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_playbooks_title ON Security_Playbooks(title);

-- ivfflat needs representative data at build time and tuning of `lists`; on a
-- table this small it only hurts recall. HNSW has no training step.
DROP INDEX IF EXISTS idx_security_playbooks_vector;
CREATE INDEX IF NOT EXISTS idx_security_playbooks_vector_hnsw
    ON Security_Playbooks USING hnsw (vector vector_cosine_ops);

-- ============================================
-- UPGRADE: TIMESTAMP -> TIMESTAMPTZ
-- Naive timestamps were stored in the DB server's local time but read back by
-- node-pg in the *app server's* local time (and filters sent from JS had their
-- offset silently dropped), so times drifted by the UTC offset. Convert any
-- legacy columns in place.
-- ============================================
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND data_type = 'timestamp without time zone'
          AND lower(table_name) IN ('users', 'network_assets', 'traffic_logs',
                                    'incidents', 'audit_logs', 'security_playbooks')
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE current_setting(''TimeZone'')',
            col.table_name, col.column_name, col.column_name);
    END LOOP;
END $$;

-- ============================================
-- TRIGGER: detect brute force
--   5+ failed attempts from one IP within 10 minutes -> one Active incident
--   per (attacker, target). Further failures while that incident is open are
--   cheap no-ops.
-- ============================================
CREATE OR REPLACE FUNCTION detect_brute_force()
RETURNS TRIGGER AS $$
DECLARE
    failed_count      INTEGER;
    asset_criticality INTEGER;
BEGIN
    IF NEW.status <> 'Failed' THEN
        RETURN NEW;
    END IF;

    -- Fast path: an incident is already open for this pair.
    IF EXISTS (
        SELECT 1 FROM Incidents
        WHERE attacker_ip = NEW.attacker_ip
          AND target_id   = NEW.target_id
          AND status      = 'Active'
    ) THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO failed_count
    FROM Traffic_Logs
    WHERE attacker_ip = NEW.attacker_ip
      AND status      = 'Failed'
      AND timestamp  >= NEW.timestamp - INTERVAL '10 minutes'
      AND timestamp  <= NEW.timestamp;

    IF failed_count >= 5 THEN
        SELECT criticality INTO asset_criticality
        FROM Network_Assets WHERE asset_id = NEW.target_id;

        INSERT INTO Incidents (attacker_ip, target_id, description, blast_radius_score)
        VALUES (
            NEW.attacker_ip,
            NEW.target_id,
            format('Brute force attack detected from %s targeting asset %s (criticality: %s). %s failed attempts in 10 minutes.',
                   host(NEW.attacker_ip), NEW.target_id, asset_criticality, failed_count),
            COALESCE(asset_criticality, 0)
        )
        ON CONFLICT (attacker_ip, target_id) WHERE status = 'Active' DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_detect_brute_force ON Traffic_Logs;
CREATE TRIGGER trigger_detect_brute_force
    AFTER INSERT ON Traffic_Logs
    FOR EACH ROW
    EXECUTE FUNCTION detect_brute_force();

-- ============================================
-- FUNCTION: compute blast radius
--   (return type changed to DOUBLE PRECISION so JSON clients get a number)
-- ============================================
DROP FUNCTION IF EXISTS compute_blast_radius(INTEGER);
CREATE FUNCTION compute_blast_radius(target_asset_id INTEGER)
RETURNS TABLE(
    affected_asset_count INTEGER,
    max_criticality      INTEGER,
    risk_score           DOUBLE PRECISION
) AS $$
    WITH target AS (
        SELECT department FROM Network_Assets WHERE asset_id = target_asset_id
    ),
    affected AS (
        -- the target itself + everything in its department
        SELECT na.asset_id, na.criticality
        FROM Network_Assets na, target t
        WHERE na.asset_id = target_asset_id
           OR (t.department IS NOT NULL AND na.department = t.department)
        UNION
        -- anything else the same attackers have touched
        SELECT na.asset_id, na.criticality
        FROM Network_Assets na
        WHERE na.asset_id IN (
            SELECT DISTINCT tl.target_id
            FROM Traffic_Logs tl
            WHERE tl.attacker_ip IN (
                SELECT DISTINCT attacker_ip FROM Traffic_Logs WHERE target_id = target_asset_id
            )
        )
    )
    SELECT
        COUNT(*)::INTEGER,
        COALESCE(MAX(criticality), 0)::INTEGER,
        COALESCE(ROUND((SUM(criticality) * LN(COUNT(*) + 1))::NUMERIC, 2), 0)::DOUBLE PRECISION
    FROM affected;
$$ LANGUAGE sql STABLE;

-- ============================================
-- FUNCTION: resolve incident (single atomic unit)
--   Locks the incident row so two analysts can't resolve it twice.
--   SQLSTATEs are mapped to HTTP codes by the API layer:
--     P0002 -> 404 (not found), 55000 -> 409 (already resolved)
-- ============================================
CREATE OR REPLACE FUNCTION resolve_incident(
    p_incident_id BIGINT,
    p_user_id     INTEGER,
    p_notes       TEXT
)
RETURNS VOID AS $$
DECLARE
    v_target_id  INTEGER;
    v_old_status VARCHAR(20);
BEGIN
    SELECT status, target_id INTO v_old_status, v_target_id
    FROM Incidents
    WHERE incident_id = p_incident_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % not found', p_incident_id USING ERRCODE = 'P0002';
    END IF;

    IF v_old_status = 'Resolved' THEN
        RAISE EXCEPTION 'Incident % is already resolved', p_incident_id USING ERRCODE = '55000';
    END IF;

    UPDATE Incidents
    SET status = 'Resolved', resolved_at = NOW(), resolved_by = p_user_id
    WHERE incident_id = p_incident_id;

    UPDATE Network_Assets
    SET criticality = GREATEST(criticality - 1, 1)
    WHERE asset_id = v_target_id;

    INSERT INTO Audit_Logs (incident_id, user_id, action, old_status, new_status, notes)
    VALUES (p_incident_id, p_user_id, 'resolve', v_old_status, 'Resolved', p_notes);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS (no ORDER BY inside a view: callers sort, and it forces a sort on every use)
-- ============================================
CREATE VIEW active_incidents_view AS
SELECT
    i.incident_id, i.attacker_ip, i.target_id, i.status, i.description,
    i.blast_radius_score, i.created_at,
    na.internal_ip AS target_ip,
    na.hostname    AS target_hostname,
    na.criticality AS asset_criticality,
    na.department  AS asset_department
FROM Incidents i
JOIN Network_Assets na ON i.target_id = na.asset_id
WHERE i.status = 'Active';

CREATE VIEW traffic_logs_with_assets AS
SELECT
    tl.log_id, tl.attacker_ip, tl.target_id, tl.status, tl.protocol, tl.port,
    tl.bytes_transferred, tl.timestamp,
    na.internal_ip AS target_ip,
    na.hostname    AS target_hostname,
    na.criticality AS asset_criticality,
    na.department  AS asset_department
FROM Traffic_Logs tl
JOIN Network_Assets na ON tl.target_id = na.asset_id;

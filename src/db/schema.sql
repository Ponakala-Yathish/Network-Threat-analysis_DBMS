-- Network Threat Intelligence Platform - Database Schema
-- PostgreSQL 15+ with pgvector extension

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Analyst')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- NETWORK ASSETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Network_Assets (
    asset_id SERIAL PRIMARY KEY,
    internal_ip INET UNIQUE NOT NULL,
    hostname VARCHAR(100),
    criticality INTEGER NOT NULL CHECK (criticality BETWEEN 1 AND 10),
    department VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TRAFFIC LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Traffic_Logs (
    log_id BIGSERIAL PRIMARY KEY,
    attacker_ip INET NOT NULL,
    target_id INTEGER NOT NULL REFERENCES Network_Assets(asset_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Allowed', 'Blocked', 'Failed')),
    protocol VARCHAR(20),
    port INTEGER,
    bytes_transferred BIGINT DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Traffic_Logs
CREATE INDEX IF NOT EXISTS idx_traffic_logs_timestamp ON Traffic_Logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_attacker_ip ON Traffic_Logs(attacker_ip);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_target_id ON Traffic_Logs(target_id);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_status ON Traffic_Logs(status);

-- ============================================
-- INCIDENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Incidents (
    incident_id BIGSERIAL PRIMARY KEY,
    attacker_ip INET NOT NULL,
    target_id INTEGER NOT NULL REFERENCES Network_Assets(asset_id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Active', 'Resolved')) DEFAULT 'Active',
    description TEXT,
    blast_radius_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES Users(user_id) ON DELETE SET NULL
);

-- Indexes for Incidents
CREATE INDEX IF NOT EXISTS idx_incidents_status ON Incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_attacker_ip ON Incidents(attacker_ip);
CREATE INDEX IF NOT EXISTS idx_incidents_target_id ON Incidents(target_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON Incidents(created_at DESC);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Audit_Logs (
    audit_id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES Incidents(incident_id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES Users(user_id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Audit_Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_incident_id ON Audit_Logs(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON Audit_Logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON Audit_Logs(created_at DESC);

-- ============================================
-- SECURITY PLAYBOOKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Security_Playbooks (
    playbook_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    threat_category VARCHAR(100),
    description TEXT NOT NULL,
    mitigation TEXT NOT NULL,
    vector VECTOR(384),
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_security_playbooks_vector 
ON Security_Playbooks 
USING ivfflat (vector vector_cosine_ops) 
WITH (lists = 100);

-- ============================================
-- TRIGGER FUNCTION: Detect Brute Force
-- ============================================
CREATE OR REPLACE FUNCTION detect_brute_force()
RETURNS TRIGGER AS $$
DECLARE
    failed_count INTEGER;
    target_asset_id INTEGER;
    asset_criticality INTEGER;
    incident_description TEXT;
BEGIN
    -- Only check on failed connection attempts
    IF NEW.status <> 'Failed' THEN
        RETURN NEW;
    END IF;

    -- Count failed attempts from this IP in the last 10 minutes
    SELECT COUNT(*) INTO failed_count
    FROM Traffic_Logs
    WHERE attacker_ip = NEW.attacker_ip
      AND status = 'Failed'
      AND timestamp >= NOW() - INTERVAL '10 minutes';

    -- Threshold: 5 failed attempts in 10 minutes
    IF failed_count >= 5 THEN
        -- Get target asset info for description
        SELECT target_id INTO target_asset_id
        FROM Traffic_Logs
        WHERE attacker_ip = NEW.attacker_ip
          AND status = 'Failed'
        ORDER BY timestamp DESC
        LIMIT 1;

        SELECT criticality INTO asset_criticality
        FROM Network_Assets
        WHERE asset_id = target_asset_id;

        incident_description := format(
            'Brute force attack detected from %s targeting asset %s (criticality: %s). %s failed attempts in 10 minutes.',
            NEW.attacker_ip,
            target_asset_id,
            asset_criticality,
            failed_count
        );

        -- Insert incident (will not duplicate if already exists for this attacker_ip and target)
        INSERT INTO Incidents (attacker_ip, target_id, description, blast_radius_score)
        VALUES (NEW.attacker_ip, NEW.target_id, incident_description, asset_criticality)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on Traffic_Logs
DROP TRIGGER IF EXISTS trigger_detect_brute_force ON Traffic_Logs;
CREATE TRIGGER trigger_detect_brute_force
    AFTER INSERT ON Traffic_Logs
    FOR EACH ROW
    EXECUTE FUNCTION detect_brute_force();

-- ============================================
-- STORED PROCEDURE: Compute Blast Radius
-- ============================================
CREATE OR REPLACE FUNCTION compute_blast_radius(target_asset_id INTEGER)
RETURNS TABLE(
    affected_asset_count INTEGER,
    max_criticality INTEGER,
    risk_score NUMERIC
) AS $$
DECLARE
    target_criticality INTEGER;
    target_department VARCHAR(50);
BEGIN
    -- Get target asset details
    SELECT criticality, department INTO target_criticality, target_department
    FROM Network_Assets
    WHERE asset_id = target_asset_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, 0.0;
        RETURN;
    END IF;

    -- Calculate blast radius: assets in same department + directly connected assets
    RETURN QUERY
    WITH affected_assets AS (
        -- Same department assets
        SELECT asset_id, criticality
        FROM Network_Assets
        WHERE department = target_department
        UNION
        -- Assets that have had traffic to/from target
        SELECT DISTINCT na.asset_id, na.criticality
        FROM Network_Assets na
        JOIN Traffic_Logs tl ON na.asset_id = tl.target_id
        WHERE tl.attacker_ip IN (
            SELECT attacker_ip FROM Traffic_Logs WHERE target_id = target_asset_id
        )
    )
    SELECT 
        COUNT(*)::INTEGER,
        MAX(criticality)::INTEGER,
        (SUM(criticality) * LN(COUNT(*) + 1))::NUMERIC
    FROM affected_assets;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STORED PROCEDURE: Resolve Incident (Transaction)
-- ============================================
CREATE OR REPLACE FUNCTION resolve_incident(
    p_incident_id BIGINT,
    p_user_id INTEGER,
    p_notes TEXT
)
RETURNS VOID AS $$
DECLARE
    v_target_id INTEGER;
    v_old_status VARCHAR(20);
BEGIN
    -- Get current incident status and target
    SELECT status, target_id INTO v_old_status, v_target_id
    FROM Incidents
    WHERE incident_id = p_incident_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % not found', p_incident_id;
    END IF;

    IF v_old_status = 'Resolved' THEN
        RAISE EXCEPTION 'Incident % is already resolved', p_incident_id;
    END IF;

    -- Atomic transaction: Update incident, decrement asset criticality, create audit log
    UPDATE Incidents
    SET status = 'Resolved',
        resolved_at = NOW(),
        resolved_by = p_user_id
    WHERE incident_id = p_incident_id;

    -- Decrement asset criticality (minimum 1)
    UPDATE Network_Assets
    SET criticality = GREATEST(criticality - 1, 1)
    WHERE asset_id = v_target_id;

    -- Create audit log entry
    INSERT INTO Audit_Logs (incident_id, user_id, action, old_status, new_status, notes)
    VALUES (p_incident_id, p_user_id, 'resolve', v_old_status, 'Resolved', p_notes);

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Active Incidents with Asset Details
-- ============================================
CREATE OR REPLACE VIEW active_incidents_view AS
SELECT 
    i.incident_id,
    i.attacker_ip,
    i.target_id,
    i.status,
    i.description,
    i.blast_radius_score,
    i.created_at,
    na.internal_ip AS target_ip,
    na.hostname AS target_hostname,
    na.criticality AS asset_criticality,
    na.department AS asset_department
FROM Incidents i
JOIN Network_Assets na ON i.target_id = na.asset_id
WHERE i.status = 'Active'
ORDER BY i.created_at DESC;

-- ============================================
-- VIEW: Traffic Logs with Asset Details
-- ============================================
CREATE OR REPLACE VIEW traffic_logs_with_assets AS
SELECT 
    tl.log_id,
    tl.attacker_ip,
    tl.target_id,
    tl.status,
    tl.protocol,
    tl.port,
    tl.bytes_transferred,
    tl.timestamp,
    na.internal_ip AS target_ip,
    na.hostname AS target_hostname,
    na.criticality AS asset_criticality,
    na.department AS asset_department
FROM Traffic_Logs tl
JOIN Network_Assets na ON tl.target_id = na.asset_id
ORDER BY tl.timestamp DESC;
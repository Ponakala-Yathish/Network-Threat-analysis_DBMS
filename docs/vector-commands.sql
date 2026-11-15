-- ============================================================================
-- Vector database (pgvector) commands: CREATE / READ / UPDATE / DELETE
--   psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/vector-commands.sql
--
-- In the app, the 384-number vector is computed in TypeScript by embedText()
-- (src/lib/embeddings.ts) and sent as a parameter: '[0.01,-0.2,...]'::vector.
-- Here in psql we cannot run that function, so the examples build vectors from
-- existing rows or from random numbers. The SQL is otherwise identical to what
-- src/lib/queries.ts runs.
-- ============================================================================

\echo '=== 0. Setup: extension, column type and index ==='
-- (from src/db/schema.sql)
--   CREATE EXTENSION IF NOT EXISTS vector;
--   vector VECTOR(384)                       -- column on Security_Playbooks
--   CREATE INDEX idx_security_playbooks_vector_hnsw
--       ON Security_Playbooks USING hnsw (vector vector_cosine_ops);

SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

SELECT playbook_id, title, vector_dims(vector) AS dims
FROM Security_Playbooks
ORDER BY playbook_id
LIMIT 3;


\echo '=== 1. CREATE: insert a playbook with its vector ==='

INSERT INTO Security_Playbooks (title, threat_category, description, mitigation, tags, vector)
VALUES (
    'Report Demo: Port Scan Response',
    'Discovery',
    'Attacker probes many ports on a host to discover open services.',
    '1. Block the scanning IP  2. Close unused ports  3. Alert on scans',
    ARRAY['port-scan', 'reconnaissance'],
    (SELECT ARRAY(SELECT random() - 0.5 FROM generate_series(1, 384)))::vector(384)
)
ON CONFLICT (title) DO NOTHING
RETURNING playbook_id, title, vector_dims(vector) AS dims;


\echo '=== 2. READ: k-nearest-neighbour search by cosine distance (<=>) ==='
-- "Which playbooks are most similar to the Brute Force playbook?"
-- similarity = 1 - cosine distance

SELECT title,
       ROUND((1 - (vector <=> q.v))::numeric, 3) AS similarity
FROM Security_Playbooks,
     (SELECT vector AS v FROM Security_Playbooks WHERE title = 'Brute Force Attack Mitigation') q
WHERE vector IS NOT NULL
ORDER BY vector <=> q.v
LIMIT 5;

-- The query plan uses the HNSW index once the table is large enough:
EXPLAIN
SELECT title FROM Security_Playbooks
ORDER BY vector <=> (SELECT vector FROM Security_Playbooks LIMIT 1)
LIMIT 5;


\echo '=== 3. UPDATE: change the text and replace the vector ==='

UPDATE Security_Playbooks
SET description = 'Attacker sweeps the network with SYN scans to map open services.',
    vector      = (SELECT ARRAY(SELECT random() - 0.5 FROM generate_series(1, 384)))::vector(384)
WHERE title = 'Report Demo: Port Scan Response'
RETURNING playbook_id, title, description;


\echo '=== 4. DELETE: remove the playbook and its vector ==='

DELETE FROM Security_Playbooks
WHERE title = 'Report Demo: Port Scan Response'
RETURNING playbook_id, title;


\echo '=== 5. Vector distance operators ==='
-- <=> cosine distance, <-> Euclidean (L2) distance, <#> negative inner product

SELECT a.title AS a, b.title AS b,
       ROUND((a.vector <=> b.vector)::numeric, 3) AS cosine_distance,
       ROUND((a.vector <-> b.vector)::numeric, 3) AS l2_distance
FROM Security_Playbooks a, Security_Playbooks b
WHERE a.title = 'Brute Force Attack Mitigation'
  AND b.title IN ('Credential Stuffing Defense', 'DDoS Attack Response');

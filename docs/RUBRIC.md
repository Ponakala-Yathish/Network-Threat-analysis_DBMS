# Rubric map

Where each assessment criterion is implemented. Paths are relative to the repository root.

| Criterion | Marks | Where to look |
|---|---|---|
| ER diagram | 2 | [`docs/er-diagram.png`](er-diagram.png). Chen notation with 8 entities, cardinalities, total participation, a multivalued attribute (`tags`) and the M:N self-relationship CONNECTS TO. Regenerate with `docs/diagrams/generate_diagrams.py`. |
| Relational schema with keys, relationships, constraints | 3 | [`docs/relational-schema.png`](relational-schema.png). PKs (including the composite PK on Asset_Connections), FKs with their `ON DELETE` rules, CHECK, UNIQUE and NOT NULL. |
| SQL DDL with constraints | 4 | [`src/db/schema.sql`](../src/db/schema.sql). PK, FK (RESTRICT / CASCADE / SET NULL), CHECK (ranges, enums, `src <> dst`), UNIQUE, NOT NULL, the partial unique index `uq_incidents_active_pair`, and the `INET` type. |
| NoSQL / vector database creation | 4 | `schema.sql`: `CREATE EXTENSION vector`, `Security_Playbooks.vector VECTOR(384)`, HNSW index `idx_security_playbooks_vector_hnsw` (cosine). |
| Technology justification | 1 | README, section *Technology Justification*. |
| DML operations | 4 | [`docs/queries.sql`](queries.sql) §1 (INSERT / UPDATE / DELETE / upsert). Used by the app in `src/lib/queries.ts` and the API routes. |
| Nested, correlated, recursive and join queries | 4 | `docs/queries.sql`: §2 3-table JOIN, §3 nested `IN`, §4 correlated subquery and `NOT EXISTS`, §6 `WITH RECURSIVE`. Live in the app: `getSecurityAnalytics()` and `get_reachable_assets()`. |
| Advanced SQL: procedure / function, trigger, CTE | 6 | `schema.sql`: trigger `trigger_detect_brute_force` → `detect_brute_force()`; functions `get_reachable_assets` (recursive CTE), `compute_blast_radius`, `resolve_incident` (row lock + audit row); procedure `archive_old_logs` (run with `CALL`); views `active_incidents_view` and `traffic_logs_with_assets`. Demonstrated in `docs/queries.sql` §6–11. |
| Vector feature and CRUD | 7 | [`docs/vector-commands.sql`](vector-commands.sql) (create, k-NN read, update and re-embed, delete, distance operators). App: `/api/playbooks` (POST, GET `?q=` similarity search), `/api/playbooks/:id` (GET / PUT / DELETE), `/api/incidents/:id/playbooks` (recommendations). UI: `src/components/playbooks/PlaybookManager.tsx`. |
| Next.js interface | 3 | `src/app/admin/*`, `src/app/analyst/*`, `src/app/login`. |
| Backend / API and database integration | 2 | `src/app/api/**` route handlers → `src/lib/queries.ts` → `src/lib/db.ts` (pooled `pg`, bind parameters, Zod validation in `src/lib/validations.ts`). |
| Authentication, two roles, RBAC in the database | 4 | Front end: `src/app/login`, `src/proxy.ts` (route guard), `src/lib/session.ts` (JWT in an HTTP-only cookie), `src/lib/password.ts` (bcrypt). Database: roles `threat_admin` / `threat_analyst` / `threat_auth` with GRANT/REVOKE, row-level security on Audit_Logs, and a per-request `SET ROLE` in `src/lib/db.ts`. Demo: [`docs/rbac-demo.sql`](rbac-demo.sql). |
| Documentation, Git / GitHub | 2 | `README.md`, this file, commit history and PRs, CI in `.github/workflows/ci.yml` (lint, type-check, build). |

## Live demo script (about 5 minutes)

1. `npm run db:setup && npm run dev`
2. Log in as `analyst` / `analyst123`. Open the incident queue, then an incident to show blast radius, lateral-movement paths (recursive CTE) and recommended playbooks (vector search). Resolve it with notes.
3. Traffic Logs: add 6 `Failed` logs from one IP to one asset. A new incident appears (trigger).
4. Log in as `admin` / `admin123`. The dashboard shows GROUP BY and correlated analytics. Then show Playbooks CRUD, the audit log entry from step 2, and Archive logs (procedure).
5. Database RBAC: `psql ... -f docs/rbac-demo.sql` shows the analyst role getting `permission denied`.

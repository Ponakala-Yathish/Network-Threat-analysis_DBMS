# Network Threat Intelligence & Incident Management Platform

**DBMS Level 3 Experiential Learning Project**  
A full-stack web application for automated network threat detection, incident triage, and resolution management.

[![CI](https://github.com/Ponakala-Yathish/Network-Threat-analysis_DBMS/actions/workflows/ci.yml/badge.svg)](https://github.com/Ponakala-Yathish/Network-Threat-analysis_DBMS/actions/workflows/ci.yml)

**Assessors:** [`docs/RUBRIC.md`](docs/RUBRIC.md) maps every rubric criterion to the file that implements it and gives a 5-minute demo script.

## Features

### Database (PostgreSQL + pgvector)
- **8 tables**: Users, Network_Assets, Asset_Connections, Traffic_Logs, Traffic_Logs_Archive, Incidents, Audit_Logs, Security_Playbooks
- **Constraints**: PK (including a composite PK), FK with `ON DELETE` rules, CHECK, UNIQUE, NOT NULL, partial unique index
- **Trigger**: `detect_brute_force` opens an incident after 5+ failed attempts from one IP in 10 minutes
- **Functions**: `resolve_incident` (atomic, row-locked), `compute_blast_radius`, `get_reachable_assets` (recursive)
- **Procedure**: `archive_old_logs`, run with `CALL`, moves old logs to the archive table in one statement
- **Queries**: joins, nested `IN` subqueries, correlated subqueries, `GROUP BY / HAVING`, CTEs and a `WITH RECURSIVE` lateral-movement query
- **Vector database**: playbooks stored as `VECTOR(384)` with an HNSW index; full create / read (similarity search) / update (re-embed) / delete
- **Role-based access inside the database**: `threat_admin`, `threat_analyst` and `threat_auth` roles with `GRANT`/`REVOKE`, `SECURITY DEFINER` functions, and row-level security on Audit_Logs. The app switches role (`SET ROLE`) on every query.

### Application (Next.js 16)
- **Two roles**: System Admin and Security Analyst, enforced in the UI, in the API and in PostgreSQL
- **Admin**: dashboard with analytics, network assets and connections, playbooks (full CRUD), audit logs, user management, log archiving
- **Analyst**: incident queue, resolution workflow, blast radius and lateral-movement analysis, playbook recommendations and search, traffic log search
- **Session-based auth**: HTTP-only cookies holding a signed JWT
- **Responsive UI**: Tailwind CSS with accessible components

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Next.js Route Handlers |
| Database | PostgreSQL 15+ with pgvector 0.5+ |
| Database driver | node-postgres (`pg`) |
| Auth | jose (JWT), bcryptjs |
| Validation | Zod |
| Icons | Lucide React |

## Technology Justification

- **PostgreSQL**: the data is strongly relational (incidents reference assets, audit rows reference incidents and users), so foreign keys, CHECK constraints and transactions keep it consistent. PostgreSQL also has everything the project needs built in: triggers, PL/pgSQL functions and procedures, recursive CTEs, the `INET` type for IP addresses, roles with `GRANT`/`REVOKE`, and row-level security.
- **pgvector (vector database)**: playbook matching needs nearest-neighbour search on embeddings. pgvector adds a `VECTOR` type, distance operators (`<=>` cosine, `<->` L2) and HNSW indexes to PostgreSQL. Vectors live next to the relational data, so one query can filter, join and rank by similarity, and one transaction covers both. A separate vector store would mean a second server and keeping two databases in sync.
- **Feature-hashing embeddings** (`src/lib/embeddings.ts`): deterministic, offline and instant, so the project runs without an API key or a model download. Any 384-dimension model (for example all-MiniLM-L6-v2) can replace it without schema changes.
- **Next.js (App Router)**: one TypeScript codebase serves the React UI and the API routes, so types are shared end to end. Server components can query the database directly (the admin dashboard does).
- **node-postgres (`pg`) with hand-written SQL** instead of an ORM: the point of the course is SQL, and every query in the report is the exact query the app runs. All values are bind parameters (`$1`), which prevents SQL injection.
- **JWT in an HTTP-only cookie (jose) + bcrypt**: stateless sessions that JavaScript in the page cannot read. jose also runs in the Next.js proxy (edge runtime). bcrypt is a slow, salted password hash.
- **Zod**: validates every request body and query string before it reaches the database, and returns clear 400 errors.
- **Tailwind CSS**: fast, consistent styling without a separate CSS codebase.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with the pgvector extension (0.5 or later)
- npm

## Quick Start

### 1. Clone and install
```bash
git clone https://github.com/Ponakala-Yathish/Network-Threat-analysis_DBMS.git
cd Network-Threat-analysis_DBMS
npm install
```

### 2. Start PostgreSQL with pgvector

**Option A: container (recommended)**
```bash
podman run -d \
  --name threat-intel-db \
  -p 5433:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=threat_intel \
  docker.io/pgvector/pgvector:pg16
```
(`docker run` takes the same arguments.)

**Option B: local PostgreSQL**
```bash
createdb threat_intel
psql -d threat_intel -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
Then set `DATABASE_PORT` in `.env` to your server's port (usually 5432).

### 3. Configure the environment
```bash
cp .env.example .env
```

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_USER` / `DATABASE_PASSWORD` | `db:*` scripts | Owner account (postgres). Creates tables, functions and roles. |
| `APP_DATABASE_USER` / `APP_DATABASE_PASSWORD` | web app | Least-privilege login `threat_app`. `db:migrate` creates it and sets this password. |
| `AUTH_SECRET` | web app | JWT signing key, 32+ characters |

### 4. Create the schema and seed data
```bash
npm run db:setup     # = db:migrate + db:seed + db:embed
```
The seed adds 2 users, 15 assets, 17 network connections, 10 playbooks and about 150 traffic logs, including two brute-force bursts that the trigger turns into incidents.

### 5. Start the app
```bash
npm run dev
```
Open http://localhost:3000

## Demo Credentials

| Role | Username | Password | Lands on |
|------|----------|----------|----------|
| Admin | `admin` | `admin123` | `/admin/dashboard` |
| Analyst | `analyst` | `analyst123` | `/analyst/incidents` |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Apply `src/db/schema.sql` (idempotent) and set the `threat_app` password |
| `npm run db:seed` | Seed initial data |
| `npm run db:embed` | Recompute every playbook vector |
| `npm run db:setup` | migrate + seed + embed |

## SQL for the report

Each file runs in psql and prints labelled results:

```bash
psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/queries.sql
psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/vector-commands.sql
psql -h localhost -p 5433 -U postgres -d threat_intel -f docs/rbac-demo.sql
```

| File | Contents |
|------|----------|
| `src/db/schema.sql` | All DDL: tables, constraints, indexes, trigger, functions, procedure, views, roles, grants, RLS |
| `docs/queries.sql` | DML, 3-table join, nested, correlated, GROUP BY/HAVING, recursive CTE, trigger, function and procedure calls |
| `docs/vector-commands.sql` | Vector create, similarity search, update, delete, distance operators |
| `docs/rbac-demo.sql` | Roles, grants, policies, and an analyst getting `permission denied` |

## Role-based access in the database

| | threat_admin | threat_analyst | threat_auth (not logged in) |
|---|---|---|---|
| Users | read/write | no access | read (login only) |
| Network_Assets, Asset_Connections | read/write | read | none |
| Traffic_Logs | read/write | read + insert | none |
| Incidents | read/write | read; resolve only through `resolve_incident()` | none |
| Audit_Logs | all rows | own rows only (row-level security) | none |
| Security_Playbooks | read/write | read | none |
| `archive_old_logs` | execute | none | none |

The web app logs in as `threat_app`, a `NOINHERIT` role with no privileges of its own. For every query, `src/lib/db.ts` reads the session cookie and runs `set_config('role', ...)` (the function form of `SET ROLE`) and sets `app.user_id` for the RLS policy, then resets both before returning the connection to the pool. If an API-level check were ever missed, PostgreSQL would still refuse the query.

`detect_brute_force` and `resolve_incident` are `SECURITY DEFINER` with a fixed `search_path`: an analyst can insert a traffic log (and so fire the trigger) or resolve an incident without direct write access to Incidents or Audit_Logs.

## Testing the Brute-Force Trigger

```bash
# 6 failed logins from one IP -> one auto-created incident
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d threat_intel -c "
INSERT INTO Traffic_Logs (attacker_ip, target_id, status)
SELECT '192.168.1.100', asset_id, 'Failed'
FROM Network_Assets, generate_series(1, 6) WHERE hostname = 'app-server-01';"

PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d threat_intel -c "
SELECT * FROM Incidents WHERE attacker_ip = '192.168.1.100';"
```

## API Overview

| Method | Route | Role | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/login`, `/api/auth/logout` | any | Session |
| GET | `/api/incidents`, `/api/incidents/:id` | both | Incident list/detail |
| POST | `/api/incidents/:id/resolve` | both | Resolve (DB function) |
| GET | `/api/incidents/:id/playbooks` | both | Vector recommendations |
| GET/POST | `/api/traffic-logs` | both | Search / ingest logs |
| GET/POST | `/api/assets` | both / Admin | List / create assets |
| PUT/DELETE | `/api/assets/:id` | Admin | Edit / delete asset |
| GET | `/api/assets/:id/reachable` | both | Recursive lateral-movement query |
| GET/POST/DELETE | `/api/asset-connections` | both / Admin | Network topology |
| GET | `/api/blast-radius/:assetId` | both | Blast radius function |
| GET/POST | `/api/playbooks` (`?q=` to search) | both / Admin | Vector read / create |
| GET/PUT/DELETE | `/api/playbooks/:id` | both / Admin | Vector read / update / delete |
| GET | `/api/admin/stats`, `/api/admin/analytics` | Admin | Counters, GROUP BY and correlated reports |
| POST | `/api/admin/archive-logs` | Admin | `CALL archive_old_logs` |
| GET/POST/PUT/DELETE | `/api/admin/users[/:id]` | Admin | User management |
| GET | `/api/admin/audit-logs` | Admin | Audit trail (CSV export with `?export=true`) |

## Project Structure

```
docs/
├── er-diagram.png           # Chen notation, matches schema.sql
├── relational-schema.png
├── diagrams/generate_diagrams.py  # regenerates both PNGs (python + matplotlib)
├── queries.sql              # SQL commands for the report
├── vector-commands.sql      # Vector CRUD commands for the report
└── rbac-demo.sql            # Database role demo
src/
├── app/
│   ├── api/
│   │   ├── auth/            # Login / logout / session
│   │   ├── incidents/       # List, detail, :id/resolve, :id/playbooks
│   │   ├── traffic-logs/    # Log ingestion + search
│   │   ├── assets/          # Assets CRUD, :id/reachable (recursive)
│   │   ├── asset-connections/  # Network topology
│   │   ├── playbooks/       # Vector CRUD + similarity search
│   │   ├── blast-radius/    # Blast radius function
│   │   └── admin/           # stats, analytics, archive-logs, users, audit-logs
│   ├── admin/               # dashboard, assets, playbooks, audit-logs, users
│   ├── analyst/             # incidents, incidents/[id], traffic-logs, playbooks
│   └── login/
├── components/
│   ├── ui/                  # Reusable UI components
│   ├── layout/              # Sidebar
│   ├── playbooks/           # PlaybookManager (shared admin/analyst)
│   └── admin/               # ArchiveLogsCard
├── lib/
│   ├── db.ts                # Connection pool + per-request SET ROLE
│   ├── auth.ts              # Cookie session helpers + requireAuth()
│   ├── session.ts           # JWT sign/verify (proxy-safe)
│   ├── password.ts          # bcrypt hash/verify
│   ├── queries.ts           # All SQL queries
│   ├── validations.ts       # Zod schemas
│   ├── api-response.ts      # Response + error helpers
│   └── embeddings.ts        # Text -> 384-dim vector
├── db/
│   └── schema.sql           # Complete DDL
├── scripts/
│   ├── migrate.ts           # Applies schema.sql, sets threat_app password
│   ├── seed.ts              # Seed data
│   ├── embed-playbooks.ts   # Recompute playbook vectors
│   └── use-owner-connection.ts  # Makes scripts log in as the DB owner
├── proxy.ts                 # Route protection (Next.js 16 middleware)
└── types/
    └── database.ts          # TypeScript types
```

## Notes on the backend design

- **Migrations** run `src/db/schema.sql` as one transaction and are idempotent. They also upgrade older databases in place.
- **Brute-force trigger**: a partial unique index guarantees one Active incident per (attacker, target), so `ON CONFLICT DO NOTHING` de-duplicates.
- **Blast radius** counts the target, its department, other assets hit by the same attackers, and everything reachable within 5 hops through Asset_Connections.
- **Playbook vectors** are recomputed on every create and update, so search results always reflect the current text.
- Errors map to HTTP codes: 400 validation, 403 wrong role, 404 not found, 409 conflicts (duplicate IP/title/username, already-resolved incident, deleting a referenced asset).

## Production Deployment

```bash
npm run build
npm run start
```

Set `DATABASE_*`, `APP_DATABASE_*`, `AUTH_SECRET` (32+ characters) and `NODE_ENV=production`, and use a strong `APP_DATABASE_PASSWORD`.

## License

Educational project for DBMS Level 3 course.

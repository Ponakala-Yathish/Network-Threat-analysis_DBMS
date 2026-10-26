# Network Threat Intelligence & Incident Management Platform

**DBMS Level 3 Experiential Learning Project**  
A full-stack web application for automated network threat detection, incident triage, and resolution management.

## Features

### Database (PostgreSQL + pgvector)
- **6 Normalized Tables**: Users, Network_Assets, Traffic_Logs, Incidents, Audit_Logs, Security_Playbooks
- **Advanced Features**:
  - **Triggers**: Auto-detect brute force attacks (5+ failed attempts in 10 minutes)
  - **Transactions**: Atomic incident resolution (status update + criticality decrement + audit log)
  - **Stored Procedures**: Blast radius computation based on asset criticality
  - **Vector Search**: Semantic similarity search for mitigation playbooks using cosine distance
- **Constraints**: PK, FK, CHECK, UNIQUE, NOT NULL at database level
- **Indexes**: Optimized for time-series queries and vector similarity search

### Application (Next.js 14)
- **Two Roles**: System Admin & Security Analyst (RBAC)
- **Admin Dashboard**: System stats, audit logs, user management
- **Analyst Workspace**: Incident queue, resolution workflow, playbook recommendations, traffic log search
- **Session-based Auth**: HTTP-only cookies with JWT
- **Responsive UI**: Tailwind CSS with accessible components

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Next.js API Routes (Route Handlers) |
| Database | PostgreSQL 15+ with pgvector |
| Auth | jose (JWT), bcryptjs |
| Validation | Zod |
| Tables | Custom DataTable component |
| Icons | Lucide React |

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- npm or yarn

## Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/Ponakala-Yathish/Network-Threat-analysis_DBMS.git
cd Network-Threat-analysis_DBMS
npm install
```

### 2. Database Setup

**Option A: Docker (Recommended)**
```bash
podman run -d \
  --name threat-intel-db \
  -p 5433:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=threat_intel \
  docker.io/pgvector/pgvector:pg16
```

**Option B: Local PostgreSQL**
```bash
# Create database and enable pgvector
createdb threat_intel
psql -d threat_intel -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials if different from defaults
```

Default `.env`:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_NAME=threat_intel
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
AUTH_SECRET=dev-secret-key-change-in-production-min-32-characters-long
```

### 4. Run Database Migrations & Seed
```bash
npm run db:migrate
npm run db:seed
npm run db:embed
```

### 5. Start Development Server
```bash
npm run dev
```

Open http://localhost:3000

## Demo Credentials

| Role | Username | Password | Redirects To |
|------|----------|----------|--------------|
| Admin | `admin` | `admin123` | `/admin/dashboard` |
| Analyst | `analyst` | `analyst123` | `/analyst/incidents` |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed initial data |
| `npm run db:embed` | Generate playbook embeddings |
| `npm run db:setup` | Run migrate + seed + embed |

## Testing the Brute-Force Trigger

```bash
# Insert 6 failed logs from same IP (triggers auto-incident creation)
for i in {1..6}; do
  PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d threat_intel -c "
  INSERT INTO Traffic_Logs (attacker_ip, target_id, status) 
  VALUES ('192.168.1.100', 1, 'Failed');"
done

# Check auto-created incident
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d threat_intel -c "
SELECT * FROM Incidents WHERE attacker_ip = '192.168.1.100';"
```

## Project Structure

```
src/
├── app/
│   ├── api/                 # API routes
│   │   ├── auth/            # Login/logout/session
│   │   ├── incidents/       # Incident CRUD + resolution + playbooks
│   │   ├── traffic-logs/    # Traffic log ingestion + search
│   │   ├── assets/          # Network assets
│   │   ├── admin/           # Admin-only endpoints
│   │   └── blast-radius/    # Blast radius computation
│   ├── admin/               # Admin pages (dashboard, audit-logs, users)
│   ├── analyst/             # Analyst pages (incidents, traffic-logs)
│   └── login/               # Login page
├── components/
│   ├── ui/                  # Reusable UI components
│   └── layout/              # Layout components (Sidebar)
├── lib/
│   ├── db.ts                # PostgreSQL connection pool
│   ├── auth.ts              # JWT session management
│   ├── queries.ts           # Database query functions
│   ├── validations.ts       # Zod schemas
│   ├── api-response.ts      # API response helpers
│   └── embeddings.ts        # Vector embedding utilities
├── db/
│   └── schema.sql           # Complete DDL schema
├── scripts/
│   ├── migrate.ts           # Migration runner
│   ├── seed.ts              # Seed data
│   └── embed-playbooks.ts   # Playbook embedding generator
└── types/
    └── database.ts          # TypeScript types
```

## Production Deployment

```bash
npm run build
npm run start
```

Ensure production environment variables are set:
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- `AUTH_SECRET` (min 32 characters)
- `NODE_ENV=production`

## License

Educational project for DBMS Level 3 course.
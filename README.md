# Network Threat Intelligence & Incident Management Platform

**DBMS Level 3 Experiential Learning Project**

A full-stack web application for automated network threat detection, incident triage, and resolution management. Built with Next.js 14, PostgreSQL, and pgvector for semantic playbook search.

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
| Tables | TanStack Table v9 |
| Icons | Lucide React |

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- npm or yarn

## Quick Start

### 1. Clone and Install
```bash
cd network-threat-intel
npm install
```

### 2. Database Setup
Create a PostgreSQL database and enable pgvector:
```sql
CREATE DATABASE threat_intel;
\c threat_intel;
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Configure Environment
Copy `.env.example` to `.env` and update credentials:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Run Migrations & Seed
```bash
npm run db:setup
```
This runs migrations, seeds initial data, and generates playbook embeddings.

### 5. Start Development Server
```bash
npm run dev
```

Open http://localhost:3000 and login with:
- **Admin**: `admin` / `admin123`
- **Analyst**: `analyst` / `analyst123`

## Project Structure

```
src/
├── app/
│   ├── api/                 # API routes
│   │   ├── auth/            # Login/logout
│   │   ├── incidents/       # Incident CRUD + resolution + playbooks
│   │   ├── traffic-logs/    # Traffic log ingestion + search
│   │   ├── assets/          # Network assets
│   │   ├── admin/           # Admin-only endpoints
│   │   └── blast-radius/    # Blast radius computation
│   ├── admin/               # Admin pages
│   │   ├── dashboard/
│   │   ├── audit-logs/
│   │   └── users/
│   ├── analyst/             # Analyst pages
│   │   ├── incidents/
│   │   │   └── [id]/        # Incident detail + resolution
│   │   └── traffic-logs/
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

## Database Schema

### Tables
- **Users**: Authentication & RBAC (Admin/Analyst)
- **Network_Assets**: Internal infrastructure assets with criticality (1-10)
- **Traffic_Logs**: Network events (attacker IP, target, status, protocol, port)
- **Incidents**: Auto-generated from triggers or manual, with blast radius score
- **Audit_Logs**: Immutable ledger of all analyst actions
- **Security_Playbooks**: Mitigation guides with pgvector embeddings

### Advanced Features
```sql
-- Trigger: Brute force detection
CREATE TRIGGER trigger_detect_brute_force
    AFTER INSERT ON Traffic_Logs
    FOR EACH ROW EXECUTE FUNCTION detect_brute_force();

-- Function: Blast radius computation
SELECT * FROM compute_blast_radius(asset_id);

-- Function: Atomic incident resolution
SELECT resolve_incident(incident_id, user_id, notes);
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Incidents (Admin, Analyst)
- `GET /api/incidents` - List with filters & pagination
- `GET /api/incidents/:id` - Incident detail
- `POST /api/incidents/:id/resolve` - Resolve incident (transaction)
- `GET /api/incidents/:id/playbooks` - Semantic playbook search

### Traffic Logs (Admin, Analyst)
- `GET /api/traffic-logs` - Search with filters
- `POST /api/traffic-logs` - Ingest log (triggers detection)

### Assets (Admin, Analyst)
- `GET /api/assets` - List all assets
- `GET /api/assets?id=:id` - Single asset

### Admin Only
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/audit-logs` - Audit log viewer
- `GET/POST /api/admin/users` - User management
- `PUT/DELETE /api/admin/users/:id` - Update/delete user
- `DELETE /api/admin/traffic-logs` - Log rotation

### Blast Radius
- `GET /api/blast-radius/:assetId` - Compute blast radius

## Development

### Running Scripts
```bash
npm run db:migrate    # Run migrations only
npm run db:seed       # Seed data only
npm run db:embed      # Generate playbook embeddings
npm run db:setup      # Full setup (migrate + seed + embed)
npm run dev           # Start dev server
npm run build         # Production build
npm run lint          # ESLint
```

### Adding Playbooks
1. Insert into Security_Playbooks table
2. Run `npm run db:embed` to generate vectors

### Testing Trigger
```sql
-- Insert 6 failed logs from same IP within 10 minutes
INSERT INTO Traffic_Logs (attacker_ip, target_id, status) 
VALUES ('192.168.1.100', 1, 'Failed');
-- Repeat 5 more times...
-- Check Incidents table for auto-created incident
```

## Documentation

- [Project Plan](PROJECT_PLAN.md) - Detailed specifications
- [Progress Tracker](PROGRESS.md) - Checkpoint-based progress
- `src/db/schema.sql` - Complete DDL with comments

## License

Educational project for DBMS Level 3 course.
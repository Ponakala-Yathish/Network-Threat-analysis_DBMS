import pg from 'pg';
import { COOKIE_NAME, verifySession } from './session';
import type { UserRole } from '../types/database';

// ---------------------------------------------------------------------------
// Type parsers
// node-pg returns BIGINT (COUNT(*), BIGSERIAL ids, bytes_transferred) and
// NUMERIC as *strings* by default. That silently breaks things like
// `row.bytes_transferred.toLocaleString()` and `risk_score.toFixed()` in the UI.
// All of our values fit comfortably inside a double.
// ---------------------------------------------------------------------------
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v));

const { Pool } = pg;

// ---------------------------------------------------------------------------
// One pool per process.
// `next dev` re-evaluates modules on every hot reload; without caching the pool
// on globalThis each reload leaks a new pool of 20 connections until Postgres
// runs out of slots ("too many clients already").
// ---------------------------------------------------------------------------
const globalForPg = globalThis as unknown as { __threatIntelPool?: pg.Pool };

// ---------------------------------------------------------------------------
// Which database account do we log in as?
//  - The db:* scripts (migrate/seed/embed) set DB_CONNECT_AS=owner and log in
//    as DATABASE_USER (postgres), because they create tables and roles.
//  - The web app logs in as APP_DATABASE_USER (threat_app), a NOINHERIT role
//    with no privileges of its own. Every query then switches to the database
//    role of whoever is logged in (see withSessionRole below), so PostgreSQL
//    itself enforces what an Admin / Analyst may do.
// ---------------------------------------------------------------------------
const isOwnerConnection = () => process.env.DB_CONNECT_AS === 'owner';

function connectionUser() {
  if (!isOwnerConnection() && process.env.APP_DATABASE_USER) {
    return { user: process.env.APP_DATABASE_USER, password: process.env.APP_DATABASE_PASSWORD || '' };
  }
  return { user: process.env.DATABASE_USER || 'postgres', password: process.env.DATABASE_PASSWORD || 'postgres' };
}

function createPool(): pg.Pool {
  const p = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'threat_intel',
    ...connectionUser(),
    max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30_000,
    // 2s was too tight for a cold start / busy pool and surfaced as random 500s.
    connectionTimeoutMillis: 10_000,
    // Runaway queries should fail, not hang a request forever.
    statement_timeout: 15_000,
  });

  // An error on an *idle* client (e.g. the DB restarted) must not take the whole
  // web server down; the pool discards that client and reconnects on demand.
  p.on('error', (err) => {
    console.error('Postgres idle client error:', err.message);
  });

  return p;
}

const pool = globalForPg.__threatIntelPool ?? createPool();
if (process.env.NODE_ENV !== 'production') {
  globalForPg.__threatIntelPool = pool;
}

// ---------------------------------------------------------------------------
// Database role of the current request
// ---------------------------------------------------------------------------
// Fixed list: the role name is never built from user input.
const DB_ROLE_FOR: Record<UserRole, DbRole> = { Admin: 'threat_admin', Analyst: 'threat_analyst' };
export type DbRole = 'threat_admin' | 'threat_analyst' | 'threat_auth';

interface DbContext {
  role: DbRole;
  userId: number | null;
}

/**
 * Reads the session cookie of the current request and returns the database
 * role to run as. Returns null for the db:* scripts (owner connection).
 * Anything else that cannot be identified runs as `threat_auth`, which can
 * only read Users: it fails closed.
 */
async function currentDbContext(): Promise<DbContext | null> {
  if (isOwnerConnection()) return null;
  try {
    const { cookies } = await import('next/headers');
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;
    if (session) return { role: DB_ROLE_FOR[session.role], userId: session.userId };
  } catch {
    // Not inside a request (no cookies available): fall through.
  }
  return { role: 'threat_auth', userId: null };
}

// set_config('role', ...) is the function form of `SET ROLE ...`; using it
// lets the role and the user id travel as bind parameters in one round trip.
const SET_CONTEXT_SQL = `SELECT set_config('role', $1, $3), set_config('app.user_id', $2, $3)`;

/** Runs `fn` on a pooled client that has switched to the request's database role. */
async function withSessionRole<R>(ctx: DbContext, fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(SET_CONTEXT_SQL, [ctx.role, ctx.userId === null ? '' : String(ctx.userId), false]);
    return await fn(client);
  } finally {
    try {
      // Never hand a client back to the pool still wearing someone else's role.
      await client.query('RESET ROLE; RESET app.user_id');
    } catch (e) {
      broken = e as Error; // release(err) destroys the connection instead of reusing it
    }
    client.release(broken);
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const ctx = await currentDbContext();
  const result = ctx
    ? await withSessionRole(ctx, (client) => client.query<T>(text, params))
    : await pool.query<T>(text, params);
  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log('Slow query:', { text: text.replace(/\s+/g, ' ').substring(0, 100), duration, rows: result.rowCount });
    }
  }
  return result;
}

export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const ctx = await currentDbContext();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (ctx) {
      // is_local = true: the role only lasts until COMMIT/ROLLBACK.
      await client.query(SET_CONTEXT_SQL, [ctx.role, ctx.userId === null ? '' : String(ctx.userId), true]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
  delete globalForPg.__threatIntelPool;
}

export default pool;

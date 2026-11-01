import pg from 'pg';

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

function createPool(): pg.Pool {
  const p = new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'threat_intel',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
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

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params as any[]);
  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log('Slow query:', { text: text.replace(/\s+/g, ' ').substring(0, 100), duration, rows: result.rowCount });
    }
  }
  return result;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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

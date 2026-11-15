#!/usr/bin/env node
// Database migration runner.  Run with: npm run db:migrate
//
// The previous version split schema.sql on ";" and dropped every chunk that
// began with a "--" comment. That discarded most CREATE TABLE statements and
// would also have cut the PL/pgSQL function bodies in half. PostgreSQL's
// simple-query protocol accepts a whole multi-statement script (including
// $$-quoted function bodies), so we send the file as one unit inside a single
// transaction: it either applies completely or not at all.

import 'dotenv/config';
import './use-owner-connection';
import fs from 'fs';
import path from 'path';
import pool, { closePool } from '../lib/db';

const MIGRATION_LOCK_ID = 727274; // arbitrary constant so two runners can't race

async function runMigration() {
  console.log('🚀 Starting database migration...');

  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(schema);

    // schema.sql creates the threat_app login role without a password (a
    // password must not live in a committed SQL file). Set it from .env.
    // format(%L) quotes it safely as a literal; DDL cannot take $1 parameters.
    const appPassword = process.env.APP_DATABASE_PASSWORD;
    if (appPassword) {
      const { rows } = await client.query<{ sql: string }>(
        `SELECT format('ALTER ROLE threat_app WITH LOGIN PASSWORD %L', $1::text) AS sql`,
        [appPassword]
      );
      await client.query(rows[0].sql);
      console.log('🔐 Password set for database login role threat_app');
    } else {
      console.warn('⚠ APP_DATABASE_PASSWORD is not set: threat_app has no password and the app cannot log in as it.');
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

runMigration()
  .then(() => closePool().then(() => process.exit(0)))
  .catch(async (error) => {
    console.error('❌ Migration failed:', error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });

#!/usr/bin/env node
// Database Migration Runner
// Run with: npx tsx src/scripts/migrate.ts

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🚀 Starting database migration...');
  
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  
  // Split by semicolon but be careful with function definitions
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`📝 Found ${statements.length} SQL statements to execute`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    try {
      await query(statement);
      console.log(`  ✓ Statement ${i + 1}/${statements.length} executed`);
    } catch (error: any) {
      // Some statements might fail if already exist (IF NOT EXISTS handles most)
      if (error.code === '42710' || error.code === '42P07' || error.message.includes('already exists')) {
        console.log(`  ⚠ Statement ${i + 1}/${statements.length} skipped (already exists)`);
      } else {
        console.error(`  ✗ Statement ${i + 1}/${statements.length} failed:`, error.message);
        console.error('Statement:', statement.substring(0, 200));
        throw error;
      }
    }
  }
  
  console.log('✅ Migration completed successfully!');
  await closePool();
  process.exit(0);
}

runMigration().catch(async (error) => {
  console.error('❌ Migration failed:', error);
  await closePool();
  process.exit(1);
});
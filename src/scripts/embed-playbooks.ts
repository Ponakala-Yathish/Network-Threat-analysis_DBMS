#!/usr/bin/env node
// Generates the vector for every security playbook. Run with: npm run db:embed
//
// Uses the SAME embedText() as the incident-matching API, so playbooks and
// incidents are always compared in one vector space. (The previous version
// optionally called a HuggingFace endpoint -- a different embedding model from
// the one used for incidents, behind a deprecated URL, and skipped re-embedding
// rows that already had a vector.) This script is idempotent: it re-embeds every
// playbook each run, which takes milliseconds.

import 'dotenv/config';
import { query, closePool } from '../lib/db';
import { embedText, embeddingToPgVector } from '../lib/embeddings';

async function embedPlaybooks() {
  console.log('🔮 Generating embeddings for security playbooks...');

  const result = await query(
    'SELECT playbook_id, title, threat_category, description, mitigation, tags FROM Security_Playbooks ORDER BY playbook_id'
  );
  if (result.rows.length === 0) {
    console.log('  ⚠ No playbooks found. Run `npm run db:seed` first.');
    return;
  }

  for (const pb of result.rows) {
    const text = [pb.title, pb.threat_category, pb.description, pb.mitigation, (pb.tags ?? []).join(' ')]
      .filter(Boolean)
      .join('. ');
    await query('UPDATE Security_Playbooks SET vector = $1::vector WHERE playbook_id = $2', [
      embeddingToPgVector(embedText(text)),
      pb.playbook_id,
    ]);
    console.log(`  ✓ ${pb.title}`);
  }
  console.log(`✅ Embedded ${result.rows.length} playbooks`);
}

embedPlaybooks()
  .then(() => closePool().then(() => process.exit(0)))
  .catch(async (error) => {
    console.error('❌ Embedding failed:', error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });

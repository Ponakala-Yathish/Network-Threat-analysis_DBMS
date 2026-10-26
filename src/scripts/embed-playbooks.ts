#!/usr/bin/env node
// Embedding Service for Security Playbooks
// Uses HuggingFace Inference API or local transformers.js
// Run with: npx tsx src/scripts/embed-playbooks.ts

import 'dotenv/config';
import { query, closePool } from '../lib/db.js';

// Using HuggingFace Inference API (free tier available)
// Alternatively, use @xenova/transformers for local inference
const HF_API_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN; // Optional: for higher rate limits

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  // API returns array of arrays, we want the first (and only) embedding
  return Array.isArray(data[0]) ? data[0] : data;
}

// Local fallback using a simple hash-based embedding (for development without API)
function generateLocalEmbedding(text: string): number[] {
  const dim = 384;
  const embedding = new Array(dim).fill(0);
  
  // Simple deterministic "embedding" based on text hash
  // In production, use real transformer model
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  
  // Generate pseudo-random but deterministic values
  const seed = Math.abs(hash);
  for (let i = 0; i < dim; i++) {
    const x = Math.sin(seed + i) * 10000;
    embedding[i] = (x - Math.floor(x)) * 2 - 1; // Values between -1 and 1
  }
  
  // Normalize to unit vector (cosine similarity requirement)
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

async function embedPlaybooks() {
  console.log('🔮 Generating embeddings for security playbooks...');
  
  try {
    // Fetch playbooks without embeddings
    const result = await query(`
      SELECT playbook_id, title, description, mitigation 
      FROM Security_Playbooks 
      WHERE vector IS NULL
    `);
    
    if (result.rows.length === 0) {
      console.log('  ✅ All playbooks already have embeddings');
      await closePool();
      process.exit(0);
    }
    
    console.log(`  📝 Found ${result.rows.length} playbooks to embed`);
    
    let useLocal = false;
    if (!HF_TOKEN) {
      console.log('  ⚠ No HUGGINGFACE_API_TOKEN set, using local fallback embeddings');
      useLocal = true;
    }
    
    for (const playbook of result.rows) {
      const text = `${playbook.title}. ${playbook.description}. ${playbook.mitigation}`;
      console.log(`  🔄 Embedding: ${playbook.title}`);
      
      let embedding: number[];
      try {
        if (useLocal) {
          embedding = generateLocalEmbedding(text);
        } else {
          embedding = await generateEmbedding(text);
        }
      } catch (error) {
        console.log(`  ⚠ API failed, falling back to local: ${error}`);
        embedding = generateLocalEmbedding(text);
        useLocal = true;
      }
      
      // Convert to PostgreSQL vector format: '[1,2,3]'
      const vectorStr = `[${embedding.join(',')}]`;
      
      await query(
        'UPDATE Security_Playbooks SET vector = $1::vector WHERE playbook_id = $2',
        [vectorStr, playbook.playbook_id]
      );
    }
    
    console.log('✅ All playbooks embedded successfully!');
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('❌ Embedding failed:', error);
    await closePool();
    process.exit(1);
  }
}

embedPlaybooks();
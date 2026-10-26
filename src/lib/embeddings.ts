// Embedding utility for incident descriptions
// Uses same approach as playbook embedding

export async function generateIncidentEmbedding(description: string): Promise<number[]> {
  // In production, use the same embedding model as playbooks
  // For now, return a deterministic embedding based on description
  
  const dim = 384;
  const embedding = new Array(dim).fill(0);
  
  // Simple deterministic embedding based on text hash
  let hash = 0;
  for (let i = 0; i < description.length; i++) {
    hash = ((hash << 5) - hash) + description.charCodeAt(i);
    hash |= 0;
  }
  
  const seed = Math.abs(hash);
  for (let i = 0; i < dim; i++) {
    const x = Math.sin(seed + i * 1.5) * 10000;
    embedding[i] = (x - Math.floor(x)) * 2 - 1;
  }
  
  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
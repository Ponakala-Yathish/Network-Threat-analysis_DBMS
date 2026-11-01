// Text -> 384-dim vector, used for BOTH playbooks (scripts/embed-playbooks.ts)
// and incidents (API), so the two always live in the same vector space.
//
// Why this replaces the old code:
//  - The old incident embedding was a pseudo-random vector seeded from a string
//    hash. Two texts sharing every word still got unrelated vectors, so
//    "similarity" was noise.
//  - The playbook script could instead call a HuggingFace endpoint (a different
//    vector space entirely, and a deprecated URL), then compare those against
//    the hash vectors above.
//
// This is a deterministic, dependency-free *feature-hashing* embedding: words
// (plus bigrams and a few security "concept" tags) are hashed into 384 signed
// buckets and L2-normalised, so cosine similarity reflects shared vocabulary.
// It runs offline in microseconds. If you later want a neural model, swap
// `embedText` for one that outputs 384 dims (e.g. all-MiniLM-L6-v2) and re-run
// `npm run db:embed` -- nothing else needs to change.

export const EMBEDDING_DIM = 384;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'from', 'with', 'by', 'at', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those',
  'into', 'than', 'then', 'so', 'such', 'via', 'not', 'no', 'do', 'does', 'can', 'will',
]);

// Maps a (stemmed) token to concept tags so that incident wording like
// "failed attempts" lands near playbook wording like "password combinations".
const CONCEPTS: Record<string, string[]> = {
  brute: ['c_auth', 'c_bruteforce'], force: ['c_bruteforce'], fail: ['c_auth'], attempt: ['c_auth'],
  password: ['c_auth'], login: ['c_auth'], credential: ['c_auth'], lockout: ['c_auth'], mfa: ['c_auth'],
  authentication: ['c_auth'], stuffing: ['c_auth', 'c_bruteforce'], leaked: ['c_auth'],
  sql: ['c_web'], injection: ['c_web'], waf: ['c_web'], sanitization: ['c_web'], query: ['c_web'],
  ddos: ['c_dos'], denial: ['c_dos'], flood: ['c_dos'], overwhelm: ['c_dos'], rate: ['c_dos'],
  malware: ['c_malware'], virus: ['c_malware'], trojan: ['c_malware'], endpoint: ['c_malware'],
  ransomware: ['c_ransom', 'c_malware'], encrypt: ['c_ransom'], ransom: ['c_ransom'], decrypt: ['c_ransom'],
  phishing: ['c_phish'], email: ['c_phish'], deceptive: ['c_phish'], sender: ['c_phish'],
  insider: ['c_insider'], exfiltrate: ['c_insider'], exfiltration: ['c_insider'], dlp: ['c_insider'],
  mitm: ['c_mitm'], intercept: ['c_mitm'], tls: ['c_mitm'], spoofing: ['c_mitm'], arp: ['c_mitm'],
  zero: ['c_zeroday'], exploit: ['c_zeroday'], vulnerability: ['c_zeroday'], patch: ['c_zeroday'],
};

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

// FNV-1a, 32-bit
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function embedText(text: string): number[] {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  const bump = (feature: string, weight = 1) => counts.set(feature, (counts.get(feature) ?? 0) + weight);

  for (let i = 0; i < tokens.length; i++) {
    bump(`w:${tokens[i]}`);
    if (i + 1 < tokens.length) bump(`b:${tokens[i]}_${tokens[i + 1]}`, 0.5);
    for (const concept of CONCEPTS[tokens[i]] ?? []) bump(concept, 1.5);
  }

  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const [feature, count] of counts) {
    const h = hash32(feature);
    const sign = (h & 1) === 0 ? 1 : -1; // signed hashing keeps collisions unbiased
    vec[(h >>> 1) % EMBEDDING_DIM] += sign * (1 + Math.log(count));
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  // An all-stopword string has no features; return a valid (unit) vector rather
  // than NaNs, which pgvector rejects.
  if (norm === 0) {
    vec[0] = 1;
    return vec;
  }
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

/** Kept for backwards compatibility with existing imports. */
export async function generateIncidentEmbedding(description: string): Promise<number[]> {
  return embedText(description);
}

export function embeddingToPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

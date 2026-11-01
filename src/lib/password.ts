import bcrypt from 'bcryptjs';

// Cost 10 is the OWASP floor for bcrypt and ~4x faster than the previous 12.
// bcryptjs is pure JavaScript, so cost 12 meant a few hundred ms of CPU per
// login/user-create. Hashes already stored at cost 12 keep verifying (the cost
// is embedded in each hash).
export const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compared against when the username doesn't exist so "unknown user" and
// "wrong password" take the same time and can't be told apart by timing.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(password: string, hash: string | undefined | null): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}

import { createHash } from 'node:crypto';

/**
 * SHA-256 hash of a raw token, as stored in `token_hash` columns (BR-ACC-04, BR-ACC-07).
 * Repositories call this, so developers always pass raw tokens and never hash them.
 */
export function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

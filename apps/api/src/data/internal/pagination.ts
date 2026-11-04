import { DataError } from '../errors';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Encodes a sort key as an opaque base64url cursor. */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Decodes a cursor produced by `encodeCursor`. Throws `INVALID_CURSOR` on bad input. */
export function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
}

/** Page size: default 20, at least 1, at most 100. */
export function clampLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

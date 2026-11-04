import { DataError } from '../errors';
import { decodeCursor, encodeCursor } from './pagination';
import type { Page } from '../types/common.types';

/** Sort key of user lists: username (case-insensitive) then id. */
export type UserSortKey = { username: string; id: string };

/** Parses a user list cursor. Throws `INVALID_CURSOR` when it does not hold a username and an id. */
export function parseUserCursor(cursor: string): UserSortKey {
  const key = decodeCursor<{ username?: unknown; id?: unknown }>(cursor);
  if (typeof key.username !== 'string' || typeof key.id !== 'string') {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return { username: key.username, id: key.id };
}

/**
 * Builds a cursor page from rows fetched with `limit + 1` items and ordered by (username, id).
 * `rows` must contain one extra row when a next page exists.
 */
export function toUserPage<R extends UserSortKey, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
): Page<T> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    rows.length > limit && last !== undefined
      ? encodeCursor({ username: last.username, id: last.id })
      : null;
  return { items: pageRows.map(map), nextCursor };
}

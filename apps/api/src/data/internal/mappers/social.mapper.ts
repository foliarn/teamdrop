import type { Selectable } from 'kysely';
import type { DB } from '../generated/database';
import type { Circle, Community } from '../../types/social.types';

/** Maps a `circle` row to the public `Circle` type. */
export function toCircle(row: Selectable<DB['circle']>): Circle {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

/** Maps a `community` row to the public `Community` type. */
export function toCommunity(row: Selectable<DB['community']>): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    joinPolicy: row.join_policy,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
  };
}

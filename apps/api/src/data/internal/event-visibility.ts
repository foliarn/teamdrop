import { type RawBuilder, type SqlBool, sql } from 'kysely';
import { blockedBetween } from './visibility';

/**
 * SQL condition: the viewer may see the event aliased `e` (the single implementation of event visibility).
 * Used by search, get, register and participant lists.
 *
 * - Organizers (owner and co-organizers) always see their own events, drafts included.
 * - Everyone else needs a published event (BR-EVT-24) and no block between the viewer and the owner or any
 *   co-organizer (BR-SOC-02).
 * - `public`: anyone.
 * - `circle_priority`: a member of a targeted circle, or anyone once `circle_priority_hours` have passed since
 *   publication (BR-EVT-23).
 * - `circle_only`: a member of a targeted circle (BR-EVT-23).
 * - `community_only`: a member of the community (BR-EVT-23).
 *
 * `viewerId` is bound as a parameter. The event must be aliased `e` in the enclosing query.
 */
export function eventVisibleTo(viewerId: string): RawBuilder<SqlBool> {
  const viewer = sql<string>`${viewerId}::uuid`;
  const ownerId = sql<string>`e.owner_id`;
  const coOrganizerId = sql<string>`eb.user_id`;
  const memberOfTargetCircle = sql<SqlBool>`EXISTS (
    SELECT 1 FROM event_circle ec
    JOIN circle_member cm ON cm.circle_id = ec.circle_id
    WHERE ec.event_id = e.id AND cm.user_id = ${viewer}
  )`;

  return sql<SqlBool>`(
    e.owner_id = ${viewer}
    OR EXISTS (
      SELECT 1 FROM event_co_organizer eco
      WHERE eco.event_id = e.id AND eco.user_id = ${viewer}
    )
    OR (
      e.status = 'published'
      AND NOT ${blockedBetween(viewer, ownerId)}
      AND NOT EXISTS (
        SELECT 1 FROM event_co_organizer eb
        WHERE eb.event_id = e.id AND ${blockedBetween(viewer, coOrganizerId)}
      )
      AND (
        e.visibility = 'public'
        OR (
          e.visibility = 'circle_priority'
          AND (
            ${memberOfTargetCircle}
            OR now() >= e.published_at + make_interval(hours => e.circle_priority_hours)
          )
        )
        OR (e.visibility = 'circle_only' AND ${memberOfTargetCircle})
        OR (
          e.visibility = 'community_only'
          AND EXISTS (
            SELECT 1 FROM community_member cm
            WHERE cm.community_id = e.community_id AND cm.user_id = ${viewer}
          )
        )
      )
    )
  )`;
}

/** SQL condition: `viewerId` is an organizer (owner or co-organizer) of the event aliased `e`. */
export function isOrganizerSql(viewerId: string): RawBuilder<SqlBool> {
  const viewer = sql<string>`${viewerId}::uuid`;
  return sql<SqlBool>`(
    e.owner_id = ${viewer}
    OR EXISTS (
      SELECT 1 FROM event_co_organizer eco
      WHERE eco.event_id = e.id AND eco.user_id = ${viewer}
    )
  )`;
}

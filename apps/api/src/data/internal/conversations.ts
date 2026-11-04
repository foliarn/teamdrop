import { type Expression, type Kysely, type RawBuilder, sql } from 'kysely';
import { NotConversationMemberError, NotFoundError } from '../errors';
import type { DB } from './generated/database';
import type { ChatEventType } from '../types/messaging.types';

/** NOTIFY channel of the real-time chat events (BR-TECH-09). */
export const CHAT_CHANNEL = 'teamdrop_chat';

/**
 * Ids of every conversation `userId` may read and post in (BR-MSG-01). Access is derived, never copied:
 * - circle chat: member of the circle (BR-SOC-08);
 * - community chat: member of the community (BR-SOC-09);
 * - occurrence chat: owner or co-organizer of the event, or an active registration (`pending_approval`, `confirmed`,
 *   `waitlisted`) for the occurrence. A cancelled, declined or removed registration loses access.
 * Use as a subquery: `cv.id IN (${accessibleConversationIds(u)})`.
 */
export function accessibleConversationIds(
  userId: Expression<string>,
): RawBuilder<string> {
  return sql<string>`
    SELECT cv.id FROM conversation cv
      JOIN circle_member cm ON cm.circle_id = cv.circle_id
      WHERE cm.user_id = ${userId}
    UNION
    SELECT cv.id FROM conversation cv
      JOIN community_member mm ON mm.community_id = cv.community_id
      WHERE mm.user_id = ${userId}
    UNION
    SELECT cv.id FROM conversation cv
      JOIN registration r ON r.occurrence_id = cv.occurrence_id
      WHERE r.user_id = ${userId} AND r.status IN ('pending_approval', 'confirmed', 'waitlisted')
    UNION
    SELECT cv.id FROM conversation cv
      JOIN event_occurrence o ON o.id = cv.occurrence_id
      JOIN event e ON e.id = o.event_id
      WHERE e.owner_id = ${userId}
    UNION
    SELECT cv.id FROM conversation cv
      JOIN event_occurrence o ON o.id = cv.occurrence_id
      JOIN event_co_organizer co ON co.event_id = o.event_id
      WHERE co.user_id = ${userId}
  `;
}

/**
 * Ids of every user with access to `conversationId` (BR-MSG-01), with the same rules as `accessibleConversationIds`.
 * Use as a subquery.
 */
export function conversationUserIds(
  conversationId: Expression<string>,
): RawBuilder<string> {
  return sql<string>`
    SELECT cm.user_id FROM conversation cv
      JOIN circle_member cm ON cm.circle_id = cv.circle_id
      WHERE cv.id = ${conversationId}
    UNION
    SELECT mm.user_id FROM conversation cv
      JOIN community_member mm ON mm.community_id = cv.community_id
      WHERE cv.id = ${conversationId}
    UNION
    SELECT r.user_id FROM conversation cv
      JOIN registration r ON r.occurrence_id = cv.occurrence_id
      WHERE cv.id = ${conversationId} AND r.user_id IS NOT NULL
        AND r.status IN ('pending_approval', 'confirmed', 'waitlisted')
    UNION
    SELECT e.owner_id FROM conversation cv
      JOIN event_occurrence o ON o.id = cv.occurrence_id
      JOIN event e ON e.id = o.event_id
      WHERE cv.id = ${conversationId}
    UNION
    SELECT co.user_id FROM conversation cv
      JOIN event_occurrence o ON o.id = cv.occurrence_id
      JOIN event_co_organizer co ON co.event_id = o.event_id
      WHERE cv.id = ${conversationId}
  `;
}

/** True when `userId` has access to `conversationId` (BR-MSG-01). */
export async function hasConversationAccess(
  db: Kysely<DB>,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const result = await sql<{ ok: boolean }>`
    SELECT ${conversationId}::uuid IN (${accessibleConversationIds(sql`${userId}::uuid`)}) AS ok
  `.execute(db);
  return result.rows[0]?.ok === true;
}

/**
 * Throws `NotFoundError` when the conversation does not exist, and `NotConversationMemberError` when the user has no
 * access to it (BR-MSG-01).
 */
export async function assertConversationAccess(
  db: Kysely<DB>,
  userId: string,
  conversationId: string,
): Promise<void> {
  const exists = await db
    .selectFrom('conversation')
    .select('id')
    .where('id', '=', conversationId)
    .executeTakeFirst();
  if (exists === undefined) {
    throw new NotFoundError('Conversation not found');
  }
  if (!(await hasConversationAccess(db, userId, conversationId))) {
    throw new NotConversationMemberError();
  }
}

/**
 * Sends a real-time chat event with PostgreSQL NOTIFY (BR-TECH-09). Inside a transaction it is delivered at commit,
 * and never after a rollback. The payload holds ids only (no body, no personal data), far below the 8 KB limit.
 */
export async function notifyChat(
  db: Kysely<DB>,
  type: ChatEventType,
  conversationId: string,
  messageId: string,
): Promise<void> {
  const payload = JSON.stringify({ type, conversationId, messageId });
  await sql`SELECT pg_notify(${CHAT_CHANNEL}, ${payload})`.execute(db);
}

/** First characters of a message body, for previews. */
export const PREVIEW_LENGTH = 200;

/**
 * Hard-deletes a message inside the caller's transaction (BR-MSG-03), after moving the read pointers on it back to the
 * previous message of the conversation (BR-MSG-02), and sends `message_deleted`. Returns the conversation id, or `null`
 * when the message does not exist.
 */
export async function deleteMessageRow(
  trx: Kysely<DB>,
  messageId: string,
): Promise<string | null> {
  const row = await trx
    .selectFrom('message')
    .select(['id', 'conversation_id'])
    .where('id', '=', messageId)
    .forUpdate()
    .executeTakeFirst();
  if (row === undefined) {
    return null;
  }
  await sql`
    UPDATE conversation_member
    SET last_read_message_id = (
      SELECT p.id FROM message p
      WHERE p.conversation_id = ${row.conversation_id}::uuid AND p.id < ${messageId}::uuid
      ORDER BY p.id DESC LIMIT 1
    )
    WHERE conversation_id = ${row.conversation_id}::uuid
      AND last_read_message_id = ${messageId}::uuid
  `.execute(trx);
  await trx.deleteFrom('message').where('id', '=', messageId).execute();
  await notifyChat(trx, 'message_deleted', row.conversation_id, messageId);
  return row.conversation_id;
}

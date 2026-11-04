import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type RawBuilder, sql } from 'kysely';
import {
  BlockedError,
  DataError,
  InvalidInputError,
  InvalidStateError,
  NotConversationMemberError,
  NotFoundError,
} from '../errors';
import {
  PREVIEW_LENGTH,
  accessibleConversationIds,
  assertConversationAccess,
  conversationUserIds,
  deleteMessageRow,
  hasConversationAccess,
  notifyChat,
} from '../internal/conversations';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import {
  findOccurrence,
  loadEvent,
  materializeOccurrence,
  originalStartOf,
} from '../internal/occurrences';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { asUuid, blockedBetween } from '../internal/visibility';
import type { Page, PageRequest } from '../types/common.types';
import type { OccurrenceKey } from '../types/event.types';
import {
  type ChatMessage,
  type ConversationTarget,
  type ConversationTargetInfo,
  type DeleteMessageOutcome,
  type MarkReadOutcome,
  type MessageReader,
  type MessageSender,
  type MyConversation,
  type ReactionCode,
  type ReactionOutcome,
  type SendMessageInput,
  type SendMessageOutcome,
  type UnreadCounts,
  MESSAGE_MAX_LENGTH,
  REACTION_CODES,
} from '../types/messaging.types';

/** Constraints of the messaging tables, mapped to typed errors. */
const MESSAGE_CONSTRAINTS: Record<string, () => DataError> = {
  ck_message_body_not_blank: () =>
    new InvalidInputError('The message body is blank'),
  ck_message_body_max_length: () =>
    new InvalidInputError('The message body is too long'),
  ck_message_reaction_emoji: () =>
    new InvalidInputError('Unknown reaction code'),
  fk_message_sender_id: () => new NotFoundError('User not found'),
  fk_message_reaction_user_id: () => new NotFoundError('User not found'),
  fk_conversation_member_user_id: () => new NotFoundError('User not found'),
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws `InvalidInputError` unless `body` is not blank and at most 4000 characters (BR-MSG-02). */
function assertBody(body: string): void {
  if (typeof body !== 'string' || body.trim() === '') {
    throw new InvalidInputError('The message body is blank');
  }
  // Counted in Unicode code points, like PostgreSQL char_length.
  if ([...body].length > MESSAGE_MAX_LENGTH) {
    throw new InvalidInputError('The message body is too long');
  }
}

/** Throws `InvalidInputError` unless `code` is in the fixed reaction list (BR-MSG-02). */
function assertReaction(code: string): asserts code is ReactionCode {
  if (!(REACTION_CODES as readonly string[]).includes(code)) {
    throw new InvalidInputError('Unknown reaction code');
  }
}

/** Row returned by `selectMessages`. */
type MessageRow = {
  id: string;
  conversation_id: string;
  client_message_id: string;
  body: string;
  created_at: Date;
  edited_at: Date | null;
  sender_id: string | null;
  sender_username: string | null;
  sender_avatar_path: string | null;
  reply_to_message_id: string | null;
  reply_hidden: boolean | null;
  reply_sender_id: string | null;
  reply_sender_username: string | null;
  reply_sender_avatar_path: string | null;
  reply_body_preview: string | null;
};

/** Row of the reaction summary. */
type ReactionRow = {
  message_id: string;
  emoji: string;
  count: number;
  mine: boolean;
};

/** Keyset cursor of `listMyConversations`: last activity (PostgreSQL text, full precision) and conversation id. */
type ConversationCursor = { at: string; id: string };

/** Row of `listMyConversations`. */
type ConversationRow = {
  id: string;
  kind: 'occurrence' | 'circle' | 'community';
  circle_id: string | null;
  circle_name: string | null;
  community_id: string | null;
  community_name: string | null;
  occurrence_id: string | null;
  event_id: string | null;
  title: string | null;
  starts_at: Date | null;
  local_date: string | null;
  muted: boolean | null;
  last_id: string | null;
  last_sender_id: string | null;
  last_sender_username: string | null;
  last_sender_avatar_path: string | null;
  last_body_preview: string | null;
  last_created_at: Date | null;
  activity_key: string;
  unread: number;
};

function senderOf(
  id: string | null,
  username: string | null,
  avatarPath: string | null,
): MessageSender {
  if (id === null || username === null) {
    return null;
  }
  return { userId: id, username, avatarPath };
}

function parseConversationCursor(cursor: string): ConversationCursor {
  const value = decodeCursor<Partial<ConversationCursor>>(cursor);
  if (typeof value.at !== 'string' || typeof value.id !== 'string') {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return { at: value.at, id: value.id };
}

function parseMessageCursor(cursor: string): string {
  const value = decodeCursor<{ id?: unknown }>(cursor);
  if (typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return value.id;
}

/**
 * Messaging: conversations of occurrences, circles and communities, messages with replies, edits, hard deletion,
 * reactions and read state (BR-MSG-01 to BR-MSG-03, BR-MSG-06, BR-TECH-08, BR-TECH-09).
 *
 * Access to a conversation is a visibility rule and is checked here: members of the circle or community, organizers of
 * the event, and users with an active registration (`pending_approval`, `confirmed`, `waitlisted`) for the occurrence.
 * Messages and reactions of users blocked with the viewer, in either direction, are hidden (BR-SOC-02, BR-SOC-04).
 * Who may delete a message (author, circle owner or admins, community owner or moderators, moderators) is checked by
 * the developers. Pushes are sent by the developers from the recipients returned by `sendMessage`.
 * Every write sends a real-time event (NOTIFY, see `ChatEventListener`) delivered at commit.
 */
@Injectable()
export class MessageRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Returns the id of the conversation of a circle, a community or an occurrence (BR-MSG-01). Circle and community
   * conversations always exist; an occurrence conversation exists only once created by
   * `getOrCreateOccurrenceConversation`.
   * Errors: `NotFoundError` (event of an occurrence key not found).
   * Outcome: the conversation id, or `null` when there is none (yet).
   */
  async getConversationId(target: ConversationTarget): Promise<string | null> {
    try {
      if ('circleId' in target) {
        const row = await this.db
          .selectFrom('conversation')
          .select('id')
          .where('circle_id', '=', target.circleId)
          .executeTakeFirst();
        return row?.id ?? null;
      }
      if ('communityId' in target) {
        const row = await this.db
          .selectFrom('conversation')
          .select('id')
          .where('community_id', '=', target.communityId)
          .executeTakeFirst();
        return row?.id ?? null;
      }
      const event = await loadEvent(this.db, target.occurrence.eventId);
      const occurrence = await findOccurrence(
        this.db,
        event.id,
        originalStartOf(event, target.occurrence.date),
      );
      if (occurrence === undefined) {
        return null;
      }
      const row = await this.db
        .selectFrom('conversation')
        .select('id')
        .where('occurrence_id', '=', occurrence.id)
        .executeTakeFirst();
      return row?.id ?? null;
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns the conversation of an occurrence, creating it on first need (BR-EVT-03 "a chat", BR-MSG-01). The occurrence
   * is materialized if it has no row yet. Idempotent, safe under concurrency. The viewer must have access: organizer of
   * the event or active registration (a new occurrence row is rolled back otherwise).
   * Errors: `NotFoundError` (event, or a date not produced by the schedule), `InvalidStateError` (draft event),
   * `NotConversationMemberError` (no access).
   * Outcome: the conversation id.
   */
  async getOrCreateOccurrenceConversation(
    viewerId: string,
    key: OccurrenceKey,
  ): Promise<string> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const event = await loadEvent(trx, key.eventId);
        if (event.status === 'draft') {
          throw new InvalidStateError('The event is not published');
        }
        // BR-EVT-03: a chat materializes the occurrence.
        const { row: occurrence } = await materializeOccurrence(
          trx,
          event,
          key.date,
        );
        // BR-MSG-01: one conversation per occurrence; concurrent calls create it once.
        await trx
          .insertInto('conversation')
          .values({ kind: 'occurrence', occurrence_id: occurrence.id })
          .onConflict((oc) =>
            oc.constraint('uq_conversation_occurrence_id').doNothing(),
          )
          .execute();
        const conversation = await trx
          .selectFrom('conversation')
          .select('id')
          .where('occurrence_id', '=', occurrence.id)
          .executeTakeFirstOrThrow();
        if (!(await hasConversationAccess(trx, viewerId, conversation.id))) {
          throw new NotConversationMemberError();
        }
        return conversation.id;
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * True when the user may read and post in the conversation (BR-MSG-01). For the WebSocket gateway, before joining a
   * room. A missing conversation gives `false`.
   */
  async hasAccess(userId: string, conversationId: string): Promise<boolean> {
    try {
      return await hasConversationAccess(this.db, userId, conversationId);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Sends a message (BR-MSG-02, BR-TECH-08). If the sender already sent a message with this `clientMessageId` (re-send
   * after a reconnection), nothing is stored and the existing message is returned with `deduplicated: true`. A reply
   * must target a message of the same conversation that the sender can see. The sender's read pointer moves to the new
   * message.
   * Errors: `InvalidInputError` (blank body, more than 4000 characters, `clientMessageId` not a UUID or already used in
   * another conversation), `NotFoundError` (conversation, reply target), `NotConversationMemberError` (no access).
   * Outcome: the message, and the users to notify: `recipientUserIds` (everyone with access, minus the sender and users
   * blocked with the sender, BR-SOC-02, BR-SOC-04) and `pushRecipientUserIds` (minus those who muted the conversation).
   * Both are empty when deduplicated. A "looking for players" broadcast (BR-SOC-08) is a circle message: push it to
   * `pushRecipientUserIds` with the `looking_for_players` notification type.
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<SendMessageOutcome> {
    assertBody(input.body);
    if (!UUID_PATTERN.test(input.clientMessageId)) {
      throw new InvalidInputError('clientMessageId must be a UUID');
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        await assertConversationAccess(trx, senderId, conversationId);

        if (input.replyToMessageId !== undefined) {
          const target = await trx
            .selectFrom('message')
            .select(['id', 'sender_id'])
            .where('id', '=', input.replyToMessageId)
            .where('conversation_id', '=', conversationId)
            .where(
              sql<boolean>`NOT ${blockedBetween(asUuid(senderId), sql<string>`sender_id`)}`,
            )
            .executeTakeFirst();
          if (target === undefined) {
            throw new NotFoundError('Reply target not found');
          }
        }

        // BR-TECH-08: a message re-sent after a reconnection is deduplicated on (sender_id, client_message_id).
        const inserted = await trx
          .insertInto('message')
          .values({
            conversation_id: conversationId,
            sender_id: senderId,
            client_message_id: input.clientMessageId,
            reply_to_message_id: input.replyToMessageId ?? null,
            body: input.body,
          })
          .onConflict((oc) =>
            oc.constraint('uq_message_sender_client_message_id').doNothing(),
          )
          .returning('id')
          .executeTakeFirst();

        if (inserted === undefined) {
          const existing = await trx
            .selectFrom('message')
            .select(['id', 'conversation_id'])
            .where('sender_id', '=', senderId)
            .where('client_message_id', '=', input.clientMessageId)
            .executeTakeFirstOrThrow();
          if (existing.conversation_id !== conversationId) {
            throw new InvalidInputError(
              'clientMessageId is already used in another conversation',
            );
          }
          const [message] = await this.selectMessages(trx, senderId, {
            messageIds: [existing.id],
          });
          return {
            message,
            deduplicated: true,
            recipientUserIds: [],
            pushRecipientUserIds: [],
          };
        }

        // BR-MSG-02: the sender has read their own message.
        await this.movePointer(trx, conversationId, senderId, inserted.id);

        // BR-SOC-02, BR-SOC-04: users blocked with the sender are not notified.
        const recipients = await sql<{ user_id: string; muted: boolean }>`
          SELECT u.user_id, COALESCE(cm.muted, false) AS muted
          FROM (${conversationUserIds(sql`${conversationId}::uuid`)}) AS u(user_id)
          LEFT JOIN conversation_member cm
            ON cm.conversation_id = ${conversationId}::uuid AND cm.user_id = u.user_id
          WHERE u.user_id <> ${senderId}::uuid
            AND NOT ${blockedBetween(asUuid(senderId), sql<string>`u.user_id`)}
          ORDER BY u.user_id
        `.execute(trx);

        await notifyChat(trx, 'message_created', conversationId, inserted.id);

        const [message] = await this.selectMessages(trx, senderId, {
          messageIds: [inserted.id],
        });
        return {
          message,
          deduplicated: false,
          recipientUserIds: recipients.rows.map((row) => row.user_id),
          pushRecipientUserIds: recipients.rows
            .filter((row) => !row.muted)
            .map((row) => row.user_id),
        };
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Edits the body of the sender's own message and sets `edited_at` (BR-MSG-02). The sender must still have access to
   * the conversation.
   * Errors: `InvalidInputError` (blank or too long body), `NotFoundError` (no such message of this sender),
   * `NotConversationMemberError` (no access any more).
   * Outcome: the edited message.
   */
  async editMessage(
    senderId: string,
    messageId: string,
    body: string,
  ): Promise<ChatMessage> {
    assertBody(body);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('message')
          .select(['id', 'conversation_id'])
          .where('id', '=', messageId)
          .where('sender_id', '=', senderId)
          .forUpdate()
          .executeTakeFirst();
        if (row === undefined) {
          throw new NotFoundError('Message not found');
        }
        await assertConversationAccess(trx, senderId, row.conversation_id);
        await trx
          .updateTable('message')
          .set({ body, edited_at: sql<Date>`now()` })
          .where('id', '=', messageId)
          .execute();
        await notifyChat(trx, 'message_edited', row.conversation_id, messageId);
        const [message] = await this.selectMessages(trx, senderId, {
          messageIds: [messageId],
        });
        return message;
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Deletes a message for good (BR-MSG-03). The developers check who may delete it: its author, the circle owner and
   * admins, the community owner and moderators, or a moderator. Its reactions are deleted, replies to it stay with no
   * reply target, and read pointers on it move back to the previous message so unread counts do not change.
   * Errors: `NotFoundError`.
   * Outcome: the conversation id, for the real-time update.
   */
  async deleteMessage(messageId: string): Promise<DeleteMessageOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        // BR-MSG-03: hard delete; BR-MSG-02: read pointers move back to the previous message.
        const conversationId = await deleteMessageRow(trx, messageId);
        if (conversationId === null) {
          throw new NotFoundError('Message not found');
        }
        return { conversationId };
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Adds a reaction from the fixed list (BR-MSG-02). Idempotent. The user must have access to the conversation and
   * must not be blocked with the author (BR-SOC-02).
   * Errors: `InvalidInputError` (unknown code), `NotFoundError` (message), `NotConversationMemberError`, `BlockedError`.
   * Outcome: `changed` is false when the reaction already existed.
   */
  async react(
    userId: string,
    messageId: string,
    code: string,
  ): Promise<ReactionOutcome> {
    assertReaction(code);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const message = await this.loadVisibleMessage(trx, userId, messageId);
        const inserted = await trx
          .insertInto('message_reaction')
          .values({ message_id: messageId, user_id: userId, emoji: code })
          .onConflict((oc) => oc.constraint('pk_message_reaction').doNothing())
          .returning('message_id')
          .executeTakeFirst();
        if (inserted === undefined) {
          return { changed: false };
        }
        await notifyChat(
          trx,
          'reaction_changed',
          message.conversation_id,
          messageId,
        );
        return { changed: true };
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Removes the user's reaction (BR-MSG-02). Idempotent.
   * Errors: `InvalidInputError` (unknown code), `NotFoundError` (message).
   * Outcome: `changed` is false when there was no such reaction.
   */
  async unreact(
    userId: string,
    messageId: string,
    code: string,
  ): Promise<ReactionOutcome> {
    assertReaction(code);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const message = await trx
          .selectFrom('message')
          .select(['id', 'conversation_id'])
          .where('id', '=', messageId)
          .executeTakeFirst();
        if (message === undefined) {
          throw new NotFoundError('Message not found');
        }
        const result = await trx
          .deleteFrom('message_reaction')
          .where('message_id', '=', messageId)
          .where('user_id', '=', userId)
          .where('emoji', '=', code)
          .executeTakeFirst();
        if (Number(result.numDeletedRows) === 0) {
          return { changed: false };
        }
        await notifyChat(
          trx,
          'reaction_changed',
          message.conversation_id,
          messageId,
        );
        return { changed: true };
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Lists the messages of a conversation, newest first, by pages (BR-MSG-02). Messages and reactions of users blocked
   * with the viewer are left out (BR-SOC-02, BR-SOC-04). A message of an erased account has `sender: null`
   * ("deleted user", BR-GDP-04).
   * Errors: `INVALID_CURSOR`.
   * Outcome: `null` when the viewer has no access (or the conversation does not exist); otherwise a page.
   */
  async listMessages(
    viewerId: string,
    conversationId: string,
    page: PageRequest = {},
  ): Promise<Page<ChatMessage> | null> {
    const limit = clampLimit(page.limit);
    const beforeId =
      page.cursor === undefined ? undefined : parseMessageCursor(page.cursor);
    try {
      return await this.db.transaction().execute(async (trx) => {
        if (!(await hasConversationAccess(trx, viewerId, conversationId))) {
          return null;
        }
        const items = await this.selectMessages(trx, viewerId, {
          conversationId,
          beforeId,
          limit: limit + 1,
        });
        const hasMore = items.length > limit;
        const pageItems = hasMore ? items.slice(0, limit) : items;
        return {
          items: pageItems,
          nextCursor: hasMore
            ? encodeCursor({ id: pageItems[pageItems.length - 1].id })
            : null,
        };
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Returns one message as the viewer sees it. For the WebSocket gateway after a real-time event.
   * Outcome: `null` when the message does not exist, the viewer has no access, or its author is blocked with the viewer.
   */
  async getMessage(
    viewerId: string,
    messageId: string,
  ): Promise<ChatMessage | null> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('message')
          .select('conversation_id')
          .where('id', '=', messageId)
          .executeTakeFirst();
        if (
          row === undefined ||
          !(await hasConversationAccess(trx, viewerId, row.conversation_id))
        ) {
          return null;
        }
        const [message] = await this.selectMessages(trx, viewerId, {
          messageIds: [messageId],
        });
        return message ?? null;
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Marks the conversation as read up to a message (BR-MSG-02). The pointer only moves forward: marking an older
   * message keeps the newer pointer.
   * Errors: `NotFoundError` (conversation, or a message not in it), `NotConversationMemberError`.
   * Outcome: the read pointer after the call.
   */
  async markRead(
    viewerId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MarkReadOutcome> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await assertConversationAccess(trx, viewerId, conversationId);
        const message = await trx
          .selectFrom('message')
          .select('id')
          .where('id', '=', messageId)
          .where('conversation_id', '=', conversationId)
          .executeTakeFirst();
        if (message === undefined) {
          throw new NotFoundError('Message not found');
        }
        const lastReadMessageId = await this.movePointer(
          trx,
          conversationId,
          viewerId,
          messageId,
        );
        return { lastReadMessageId };
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Mutes or unmutes a conversation for the viewer. A muted conversation gives no push but keeps its unread count
   * (BR-NOT-01).
   * Errors: `NotFoundError` (conversation), `NotConversationMemberError`.
   * Outcome: nothing.
   */
  async setMuted(
    viewerId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        await assertConversationAccess(trx, viewerId, conversationId);
        await trx
          .insertInto('conversation_member')
          .values({ conversation_id: conversationId, user_id: viewerId, muted })
          .onConflict((oc) =>
            oc
              .constraint('pk_conversation_member')
              .doUpdateSet({ muted: (eb) => eb.ref('excluded.muted') }),
          )
          .execute();
      });
    } catch (err) {
      throw mapDbError(err, MESSAGE_CONSTRAINTS);
    }
  }

  /**
   * Lists the conversations the viewer has access to, most recent activity first (last visible message, or creation
   * when empty), with the target, the last visible message, the unread count and the mute flag (BR-MSG-01, BR-MSG-02).
   * Errors: `INVALID_CURSOR`.
   * Outcome: a page.
   */
  async listMyConversations(
    viewerId: string,
    page: PageRequest = {},
  ): Promise<Page<MyConversation>> {
    const limit = clampLimit(page.limit);
    const cursor =
      page.cursor === undefined
        ? undefined
        : parseConversationCursor(page.cursor);
    const viewer = asUuid(viewerId);
    try {
      const result = await sql<ConversationRow>`
        WITH base AS (
          SELECT
            cv.id, cv.kind, cv.circle_id, ci.name AS circle_name, cv.community_id, co.name AS community_name,
            cv.occurrence_id, o.event_id, e.title, o.starts_at,
            to_char(o.original_starts_at AT TIME ZONE e.time_zone, 'YYYY-MM-DD') AS local_date,
            cm.muted, cm.last_read_message_id,
            lm.id AS last_id, lm.sender_id AS last_sender_id, lu.username AS last_sender_username,
            lu.avatar_path AS last_sender_avatar_path, left(lm.body, ${PREVIEW_LENGTH}) AS last_body_preview,
            lm.created_at AS last_created_at,
            COALESCE(lm.created_at, cv.created_at) AS activity_at
          FROM conversation cv
          LEFT JOIN circle ci ON ci.id = cv.circle_id
          LEFT JOIN community co ON co.id = cv.community_id
          LEFT JOIN event_occurrence o ON o.id = cv.occurrence_id
          LEFT JOIN event e ON e.id = o.event_id
          LEFT JOIN conversation_member cm ON cm.conversation_id = cv.id AND cm.user_id = ${viewer}
          LEFT JOIN LATERAL (
            SELECT m.id, m.sender_id, m.body, m.created_at FROM message m
            WHERE m.conversation_id = cv.id AND NOT ${blockedBetween(viewer, sql<string>`m.sender_id`)}
            ORDER BY m.id DESC LIMIT 1
          ) lm ON true
          LEFT JOIN user_account lu ON lu.id = lm.sender_id
          WHERE cv.id IN (${accessibleConversationIds(viewer)})
        )
        SELECT base.*, base.activity_at::text AS activity_key, ${this.unreadSql(viewer)} AS unread
        FROM base
        ${
          cursor === undefined
            ? sql``
            : sql`WHERE (base.activity_at, base.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
        }
        ORDER BY base.activity_at DESC, base.id DESC
        LIMIT ${limit + 1}
      `.execute(this.db);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map((row) => this.toMyConversation(row)),
        nextCursor: hasMore
          ? encodeCursor({ at: last.activity_key, id: last.id })
          : null,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Unread messages per conversation and in total (BR-MSG-02): messages after the viewer's read pointer, own messages
   * and messages of users blocked with the viewer left out. Muted conversations are counted.
   * Outcome: the total, and the conversations with at least one unread message.
   */
  async getUnreadCounts(viewerId: string): Promise<UnreadCounts> {
    const viewer = asUuid(viewerId);
    try {
      const result = await sql<{ id: string; unread: number }>`
        SELECT base.id, ${this.unreadSql(viewer)} AS unread
        FROM (
          SELECT cv.id, cm.last_read_message_id
          FROM conversation cv
          LEFT JOIN conversation_member cm ON cm.conversation_id = cv.id AND cm.user_id = ${viewer}
          WHERE cv.id IN (${accessibleConversationIds(viewer)})
        ) base
        ORDER BY base.id
      `.execute(this.db);
      const byConversation = result.rows
        .filter((row) => row.unread > 0)
        .map((row) => ({ conversationId: row.id, unread: row.unread }));
      return {
        total: byConversation.reduce((sum, row) => sum + row.unread, 0),
        byConversation,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * "Seen by" (BR-MSG-02): users with access whose read pointer is at or after the message. The author, the viewer and
   * users blocked with the viewer are left out. Ordered by username.
   * Outcome: `null` when the message does not exist, the viewer has no access, or its author is blocked with the viewer.
   */
  async listReaders(
    viewerId: string,
    messageId: string,
  ): Promise<MessageReader[] | null> {
    const viewer = asUuid(viewerId);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const message = await trx
          .selectFrom('message')
          .select(['id', 'conversation_id', 'sender_id'])
          .where('id', '=', messageId)
          .where(
            sql<boolean>`NOT ${blockedBetween(viewer, sql<string>`sender_id`)}`,
          )
          .executeTakeFirst();
        if (
          message === undefined ||
          !(await hasConversationAccess(trx, viewerId, message.conversation_id))
        ) {
          return null;
        }
        const result = await sql<{
          id: string;
          username: string;
          avatar_path: string | null;
        }>`
          SELECT u.id, u.username, u.avatar_path
          FROM conversation_member cm
          JOIN user_account u ON u.id = cm.user_id
          WHERE cm.conversation_id = ${message.conversation_id}::uuid
            AND cm.last_read_message_id >= ${messageId}::uuid
            AND cm.user_id IN (${conversationUserIds(sql`${message.conversation_id}::uuid`)})
            AND cm.user_id <> ${viewer}
            AND cm.user_id IS DISTINCT FROM ${message.sender_id}::uuid
            AND NOT ${blockedBetween(viewer, sql<string>`u.id`)}
          ORDER BY u.username, u.id
        `.execute(trx);
        return result.rows.map((row) => ({
          userId: row.id,
          username: row.username,
          avatarPath: row.avatar_path,
        }));
      });
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Unread count expression for a `base` row with `id` and `last_read_message_id` (BR-MSG-02, BR-SOC-04). */
  private unreadSql(viewer: ReturnType<typeof asUuid>): RawBuilder<number> {
    return sql<number>`(
      SELECT count(*)::int FROM message m
      WHERE m.conversation_id = base.id
        AND (base.last_read_message_id IS NULL OR m.id > base.last_read_message_id)
        AND m.sender_id IS DISTINCT FROM ${viewer}
        AND NOT ${blockedBetween(viewer, sql<string>`m.sender_id`)}
    )`;
  }

  /** Moves the user's read pointer forward to `messageId` (never backward) and returns the pointer (BR-MSG-02). */
  private async movePointer(
    trx: Kysely<DB>,
    conversationId: string,
    userId: string,
    messageId: string,
  ): Promise<string> {
    const row = await trx
      .insertInto('conversation_member')
      .values({
        conversation_id: conversationId,
        user_id: userId,
        last_read_message_id: messageId,
      })
      .onConflict((oc) =>
        oc.constraint('pk_conversation_member').doUpdateSet({
          last_read_message_id: sql<string>`GREATEST(conversation_member.last_read_message_id, excluded.last_read_message_id)`,
        }),
      )
      .returning('last_read_message_id')
      .executeTakeFirstOrThrow();
    return row.last_read_message_id ?? messageId;
  }

  /**
   * Loads a message the user may react to: it exists, the user has access, and the user is not blocked with its author.
   */
  private async loadVisibleMessage(
    trx: Kysely<DB>,
    userId: string,
    messageId: string,
  ): Promise<{ conversation_id: string }> {
    const message = await trx
      .selectFrom('message')
      .select(['conversation_id', 'sender_id'])
      .where('id', '=', messageId)
      .executeTakeFirst();
    if (message === undefined) {
      throw new NotFoundError('Message not found');
    }
    await assertConversationAccess(trx, userId, message.conversation_id);
    if (message.sender_id !== null) {
      const blocked = await trx
        .selectNoFrom([
          blockedBetween(asUuid(userId), asUuid(message.sender_id)).as(
            'blocked',
          ),
        ])
        .executeTakeFirstOrThrow();
      if (blocked.blocked) {
        throw new BlockedError();
      }
    }
    return message;
  }

  /**
   * Selects messages as `viewerId` sees them: by ids, or a page of one conversation (newest first). Messages of users
   * blocked with the viewer are left out, and so are their reactions (BR-SOC-02, BR-SOC-04). Access is not checked here.
   */
  private async selectMessages(
    trx: Kysely<DB>,
    viewerId: string,
    filter:
      | { messageIds: string[] }
      | { conversationId: string; beforeId?: string; limit: number },
  ): Promise<ChatMessage[]> {
    const viewer = asUuid(viewerId);
    const where =
      'messageIds' in filter
        ? sql`m.id = ANY(${filter.messageIds}::uuid[])`
        : sql`m.conversation_id = ${filter.conversationId}::uuid
            ${filter.beforeId === undefined ? sql`` : sql`AND m.id < ${filter.beforeId}::uuid`}`;
    const limit = 'limit' in filter ? sql`LIMIT ${filter.limit}` : sql``;
    const result = await sql<MessageRow>`
      SELECT
        m.id, m.conversation_id, m.client_message_id, m.body, m.created_at, m.edited_at,
        m.sender_id, su.username AS sender_username, su.avatar_path AS sender_avatar_path,
        m.reply_to_message_id,
        ${blockedBetween(viewer, sql<string>`rm.sender_id`)} AS reply_hidden,
        rm.sender_id AS reply_sender_id, ru.username AS reply_sender_username,
        ru.avatar_path AS reply_sender_avatar_path, left(rm.body, ${PREVIEW_LENGTH}) AS reply_body_preview
      FROM message m
      LEFT JOIN user_account su ON su.id = m.sender_id
      LEFT JOIN message rm ON rm.id = m.reply_to_message_id
      LEFT JOIN user_account ru ON ru.id = rm.sender_id
      WHERE ${where}
        AND NOT ${blockedBetween(viewer, sql<string>`m.sender_id`)}
      ORDER BY m.id DESC
      ${limit}
    `.execute(trx);
    const rows = result.rows;
    if (rows.length === 0) {
      return [];
    }

    const reactions = await sql<ReactionRow>`
      SELECT mr.message_id, mr.emoji, count(*)::int AS count, bool_or(mr.user_id = ${viewer}) AS mine
      FROM message_reaction mr
      WHERE mr.message_id = ANY(${rows.map((row) => row.id)}::uuid[])
        AND NOT ${blockedBetween(viewer, sql<string>`mr.user_id`)}
      GROUP BY mr.message_id, mr.emoji
    `.execute(trx);
    const byMessage = new Map<string, ReactionRow[]>();
    for (const reaction of reactions.rows) {
      const list = byMessage.get(reaction.message_id) ?? [];
      list.push(reaction);
      byMessage.set(reaction.message_id, list);
    }

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      clientMessageId: row.client_message_id,
      sender: senderOf(
        row.sender_id,
        row.sender_username,
        row.sender_avatar_path,
      ),
      body: row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      replyTo:
        row.reply_to_message_id === null
          ? null
          : row.reply_hidden === true
            ? { messageId: row.reply_to_message_id, hidden: true }
            : {
                messageId: row.reply_to_message_id,
                hidden: false,
                sender: senderOf(
                  row.reply_sender_id,
                  row.reply_sender_username,
                  row.reply_sender_avatar_path,
                ),
                bodyPreview: row.reply_body_preview ?? '',
              },
      reactions: (byMessage.get(row.id) ?? [])
        .map((reaction) => ({
          code: reaction.emoji as ReactionCode,
          count: reaction.count,
          reactedByMe: reaction.mine,
        }))
        .sort(
          (a, b) =>
            REACTION_CODES.indexOf(a.code) - REACTION_CODES.indexOf(b.code),
        ),
    }));
  }

  private toMyConversation(row: ConversationRow): MyConversation {
    let target: ConversationTargetInfo;
    if (row.kind === 'circle') {
      target = {
        kind: 'circle',
        circleId: row.circle_id ?? '',
        name: row.circle_name ?? '',
      };
    } else if (row.kind === 'community') {
      target = {
        kind: 'community',
        communityId: row.community_id ?? '',
        name: row.community_name ?? '',
      };
    } else {
      target = {
        kind: 'occurrence',
        occurrenceId: row.occurrence_id ?? '',
        key: { eventId: row.event_id ?? '', date: row.local_date ?? '' },
        title: row.title ?? '',
        startsAt: row.starts_at ?? new Date(0),
      };
    }
    return {
      conversationId: row.id,
      target,
      lastMessage:
        row.last_id === null
          ? null
          : {
              id: row.last_id,
              sender: senderOf(
                row.last_sender_id,
                row.last_sender_username,
                row.last_sender_avatar_path,
              ),
              bodyPreview: row.last_body_preview ?? '',
              createdAt: row.last_created_at ?? new Date(0),
            },
      unreadCount: row.unread,
      muted: row.muted ?? false,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, type Updateable, sql } from 'kysely';
import {
  DataError,
  InvalidInputError,
  InvalidReferenceError,
  InvalidStateError,
  NotFoundError,
} from '../errors';
import { mapDbError } from '../internal/db-errors';
import type { DB } from '../internal/generated/database';
import { KYSELY } from '../internal/kysely';
import { clampLimit, decodeCursor, encodeCursor } from '../internal/pagination';
import { asUuid, blockedBetween } from '../internal/visibility';
import type { Page, PageRequest } from '../types/common.types';
import type {
  AppNotification,
  CreateNotificationTypeInput,
  MyPushSubscription,
  NotificationPayload,
  NotificationPreference,
  NotificationPreferencePatch,
  NotificationType,
  NotifyOutcome,
  PushTarget,
  SavePushSubscriptionInput,
  UpdateNotificationTypePatch,
} from '../types/notification.types';

/** Constraints of the notification tables, mapped to typed errors. */
const NOTIFICATION_CONSTRAINTS: Record<string, () => DataError> = {
  uq_notification_type_code: () =>
    new InvalidInputError('Notification type code is already used'),
  fk_notification_notification_type_id: () =>
    new InvalidStateError('The notification type is in use'),
  fk_notification_preference_notification_type_id: () =>
    new InvalidStateError('The notification type is in use'),
  fk_push_subscription_user_id: () => new NotFoundError('User not found'),
  fk_notification_preference_user_id: () => new NotFoundError('User not found'),
  ck_notification_payload_object: () =>
    new InvalidInputError('The payload must be a JSON object'),
};

/** Row of `notification_type`. */
type NotificationTypeRow = Selectable<DB['notification_type']>;

/** Row of a push target query. */
type PushTargetRow = {
  user_id: string;
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

function toNotificationType(row: NotificationTypeRow): NotificationType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    defaultPush: row.default_push,
    defaultInApp: row.default_in_app,
  };
}

function toPushTarget(row: PushTargetRow): PushTarget {
  return {
    userId: row.user_id,
    subscriptionId: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    authSecret: row.auth_secret,
  };
}

/** Throws `InvalidInputError` unless `payload` is a plain JSON object. */
function assertPayload(payload: NotificationPayload): void {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new InvalidInputError('The payload must be a JSON object');
  }
}

/** Throws `InvalidInputError` unless `value` is a non-empty string. */
function assertText(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInputError(`${name} is required`);
  }
}

function parseNotificationCursor(cursor: string): string {
  const value = decodeCursor<{ id?: unknown }>(cursor);
  if (typeof value.id !== 'string') {
    throw new DataError('INVALID_CURSOR', 'Invalid cursor');
  }
  return value.id;
}

/**
 * Notifications (BR-NOT-01, BR-ACC-15): notification types (back office), per-type and per-channel preferences,
 * in-app notifications and Web Push subscriptions (one per device).
 *
 * The data layer applies the preferences and returns the push targets; the developers decide when to notify, check
 * permissions, and send the pushes. A missing preference row means the type defaults. In-app notifications are kept
 * 90 days (purged by the database, BR-GDP-09).
 */
@Injectable()
export class NotificationRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * Notifies users of one type (BR-NOT-01). Creates an in-app notification for each recipient whose in-app channel is
   * enabled, and returns the devices of the recipients whose push channel is enabled. Duplicate ids are merged, unknown
   * users are skipped. With `actorId` (the user who caused it), the actor and the users blocked with the actor, in either
   * direction, are left out (BR-SOC-02).
   * Errors: `InvalidReferenceError` (unknown type code), `InvalidInputError` (payload not a JSON object).
   * Outcome: the created notifications, the users who got one, and the push targets.
   */
  async notify(
    typeCode: string,
    userIds: string[],
    payload: NotificationPayload = {},
    options: { actorId?: string } = {},
  ): Promise<NotifyOutcome> {
    assertPayload(payload);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const type = await this.typeByCode(trx, typeCode);
        const recipients = await this.recipients(
          trx,
          type.id,
          userIds,
          options.actorId,
        );
        const inAppIds = recipients
          .filter((row) => row.in_app)
          .map((row) => row.user_id);
        let created: { id: string; user_id: string }[] = [];
        if (inAppIds.length > 0) {
          created = await trx
            .insertInto('notification')
            .values(
              inAppIds.map((userId) => ({
                user_id: userId,
                notification_type_id: type.id,
                payload: JSON.stringify(payload),
              })),
            )
            .returning(['id', 'user_id'])
            .execute();
        }
        const pushTargets = await this.pushTargetsOf(
          trx,
          recipients.filter((row) => row.push).map((row) => row.user_id),
        );
        return {
          notificationIds: created.map((row) => row.id),
          inAppUserIds: created.map((row) => row.user_id),
          pushTargets,
        };
      });
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Returns the devices to push to for a notification type, without creating in-app notifications (for example
   * `new_message`, BR-MSG-02). Applies the same preferences and the same `actorId` filtering as `notify`.
   * Errors: `InvalidReferenceError` (unknown type code).
   * Outcome: the push targets.
   */
  async listPushTargets(
    typeCode: string,
    userIds: string[],
    options: { actorId?: string } = {},
  ): Promise<PushTarget[]> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const type = await this.typeByCode(trx, typeCode);
        const recipients = await this.recipients(
          trx,
          type.id,
          userIds,
          options.actorId,
        );
        return this.pushTargetsOf(
          trx,
          recipients.filter((row) => row.push).map((row) => row.user_id),
        );
      });
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Lists the user's in-app notifications, newest first, by pages (BR-NOT-01).
   * Errors: `INVALID_CURSOR`.
   * Outcome: a page; only unread notifications when `unreadOnly` is true.
   */
  async listNotifications(
    userId: string,
    page: PageRequest & { unreadOnly?: boolean } = {},
  ): Promise<Page<AppNotification>> {
    const limit = clampLimit(page.limit);
    const beforeId =
      page.cursor === undefined
        ? undefined
        : parseNotificationCursor(page.cursor);
    try {
      let query = this.db
        .selectFrom('notification as n')
        .innerJoin('notification_type as t', 't.id', 'n.notification_type_id')
        .select(['n.id', 't.code', 'n.payload', 'n.created_at', 'n.read_at'])
        .where('n.user_id', '=', userId)
        .orderBy('n.id', 'desc')
        .limit(limit + 1);
      if (beforeId !== undefined) {
        query = query.where('n.id', '<', beforeId);
      }
      if (page.unreadOnly === true) {
        query = query.where('n.read_at', 'is', null);
      }
      const rows = await query.execute();
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageRows.map((row) => ({
          id: row.id,
          typeCode: row.code,
          payload: row.payload as NotificationPayload,
          createdAt: row.created_at,
          readAt: row.read_at,
        })),
        nextCursor: hasMore
          ? encodeCursor({ id: pageRows[pageRows.length - 1].id })
          : null,
      };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Number of unread in-app notifications of the user (BR-NOT-01). */
  async countUnread(userId: string): Promise<number> {
    try {
      const row = await this.db
        .selectFrom('notification')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('user_id', '=', userId)
        .where('read_at', 'is', null)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Marks some of the user's notifications as read. Ids of other users' notifications and already read ones are ignored.
   * Outcome: the number of notifications marked.
   */
  async markRead(
    userId: string,
    notificationIds: string[],
  ): Promise<{ updated: number }> {
    if (notificationIds.length === 0) {
      return { updated: 0 };
    }
    try {
      const result = await this.db
        .updateTable('notification')
        .set({ read_at: sql<Date>`now()` })
        .where('user_id', '=', userId)
        .where('id', 'in', notificationIds)
        .where('read_at', 'is', null)
        .executeTakeFirst();
      return { updated: Number(result.numUpdatedRows) };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Marks every unread notification of the user as read. Outcome: the number of notifications marked. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    try {
      const result = await this.db
        .updateTable('notification')
        .set({ read_at: sql<Date>`now()` })
        .where('user_id', '=', userId)
        .where('read_at', 'is', null)
        .executeTakeFirst();
      return { updated: Number(result.numUpdatedRows) };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Deletes one of the user's notifications (hard delete, BR-TECH-06).
   * Errors: `NotFoundError` (no such notification of this user).
   */
  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('notification')
        .where('id', '=', notificationId)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Notification not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Lists the user's effective preference for every notification type, ordered by code (BR-NOT-01, BR-ACC-15).
   * Outcome: the preferences; `isDefault` is true when the user has no override.
   */
  async listPreferences(userId: string): Promise<NotificationPreference[]> {
    try {
      const rows = await this.db
        .selectFrom('notification_type as t')
        .leftJoin('notification_preference as p', (join) =>
          join
            .onRef('p.notification_type_id', '=', 't.id')
            .on('p.user_id', '=', userId),
        )
        .select([
          't.code',
          't.name',
          't.default_push',
          't.default_in_app',
          'p.push_enabled',
          'p.in_app_enabled',
        ])
        .orderBy('t.code')
        .execute();
      return rows.map((row) => ({
        typeCode: row.code,
        typeName: row.name,
        push: row.push_enabled ?? row.default_push,
        inApp: row.in_app_enabled ?? row.default_in_app,
        isDefault: row.push_enabled === null,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Sets the user's preference for one notification type (BR-NOT-01, BR-ACC-15). A missing field keeps its current
   * effective value.
   * Errors: `InvalidReferenceError` (unknown type code), `NotFoundError` (user).
   * Outcome: the effective preference after the change.
   */
  async setPreference(
    userId: string,
    typeCode: string,
    patch: NotificationPreferencePatch,
  ): Promise<NotificationPreference> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        const type = await this.typeByCode(trx, typeCode);
        const current = await trx
          .selectFrom('notification_preference')
          .select(['push_enabled', 'in_app_enabled'])
          .where('user_id', '=', userId)
          .where('notification_type_id', '=', type.id)
          .forUpdate()
          .executeTakeFirst();
        const push = patch.push ?? current?.push_enabled ?? type.default_push;
        const inApp =
          patch.inApp ?? current?.in_app_enabled ?? type.default_in_app;
        await trx
          .insertInto('notification_preference')
          .values({
            user_id: userId,
            notification_type_id: type.id,
            push_enabled: push,
            in_app_enabled: inApp,
          })
          .onConflict((oc) =>
            oc.constraint('pk_notification_preference').doUpdateSet({
              push_enabled: push,
              in_app_enabled: inApp,
            }),
          )
          .execute();
        return {
          typeCode: type.code,
          typeName: type.name,
          push,
          inApp,
          isDefault: false,
        };
      });
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Saves the Web Push subscription of a device (BR-NOT-01: one per device). The endpoint is unique: if it is already
   * stored, for this user or another one (a shared device), it is moved to this user and its keys are replaced.
   * Errors: `InvalidInputError` (missing endpoint or keys), `NotFoundError` (user).
   * Outcome: the subscription id.
   */
  async savePushSubscription(
    userId: string,
    input: SavePushSubscriptionInput,
  ): Promise<{ id: string }> {
    assertText(input.endpoint, 'endpoint');
    assertText(input.p256dh, 'p256dh');
    assertText(input.authSecret, 'authSecret');
    try {
      const row = await this.db
        .insertInto('push_subscription')
        .values({
          user_id: userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth_secret: input.authSecret,
          user_agent: input.userAgent ?? null,
        })
        .onConflict((oc) =>
          oc.constraint('uq_push_subscription_endpoint').doUpdateSet({
            user_id: userId,
            p256dh: input.p256dh,
            auth_secret: input.authSecret,
            user_agent: input.userAgent ?? null,
          }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();
      return { id: row.id };
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Lists the user's devices for the settings screen, newest first. Keys are never returned here.
   */
  async listMyPushSubscriptions(userId: string): Promise<MyPushSubscription[]> {
    try {
      const rows = await this.db
        .selectFrom('push_subscription')
        .select(['id', 'user_agent', 'created_at', 'last_used_at'])
        .where('user_id', '=', userId)
        .orderBy('id', 'desc')
        .execute();
      return rows.map((row) => ({
        id: row.id,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      }));
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Deletes the user's subscription of a device (logout, push disabled on the device).
   * Errors: `NotFoundError` (no such endpoint for this user).
   */
  async deletePushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('push_subscription')
        .where('endpoint', '=', endpoint)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Push subscription not found');
      }
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Deletes a subscription the push service reported as gone (HTTP 404 or 410). For the push sender, no user check.
   * Outcome: `removed` is false when it was already gone.
   */
  async removeExpiredPushSubscription(
    endpoint: string,
  ): Promise<{ removed: boolean }> {
    try {
      const result = await this.db
        .deleteFrom('push_subscription')
        .where('endpoint', '=', endpoint)
        .executeTakeFirst();
      return { removed: Number(result.numDeletedRows) > 0 };
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Records that pushes were sent to these subscriptions (`last_used_at = now()`). Unknown ids are ignored. */
  async markPushSubscriptionsUsed(subscriptionIds: string[]): Promise<void> {
    if (subscriptionIds.length === 0) {
      return;
    }
    try {
      await this.db
        .updateTable('push_subscription')
        .set({ last_used_at: sql<Date>`now()` })
        .where('id', 'in', subscriptionIds)
        .execute();
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /** Lists the notification types, ordered by code (reference data, BR-TECH-12). */
  async listNotificationTypes(): Promise<NotificationType[]> {
    try {
      const rows = await this.db
        .selectFrom('notification_type')
        .selectAll()
        .orderBy('code')
        .execute();
      return rows.map(toNotificationType);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  /**
   * Creates a notification type (back office). The caller checks the admin role. The front end shows the English
   * `name` until it has a translation for the code (BR-TECH-12).
   * Errors: `InvalidInputError` (code already used, blank code or name).
   * Outcome: the created type.
   */
  async createNotificationType(
    input: CreateNotificationTypeInput,
  ): Promise<NotificationType> {
    assertText(input.code, 'code');
    assertText(input.name, 'name');
    try {
      const row = await this.db
        .insertInto('notification_type')
        .values({
          code: input.code,
          name: input.name,
          default_push: input.defaultPush,
          default_in_app: input.defaultInApp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toNotificationType(row);
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Updates the given fields of a notification type (back office). The caller checks the admin role. Changing the
   * defaults affects users without an override.
   * Errors: `NotFoundError`, `InvalidInputError` (duplicate or blank code, blank name).
   * Outcome: the updated type.
   */
  async updateNotificationType(
    id: string,
    patch: UpdateNotificationTypePatch,
  ): Promise<NotificationType> {
    const values: Updateable<DB['notification_type']> = {};
    if (patch.code !== undefined) {
      assertText(patch.code, 'code');
      values.code = patch.code;
    }
    if (patch.name !== undefined) {
      assertText(patch.name, 'name');
      values.name = patch.name;
    }
    if (patch.defaultPush !== undefined)
      values.default_push = patch.defaultPush;
    if (patch.defaultInApp !== undefined) {
      values.default_in_app = patch.defaultInApp;
    }
    try {
      const query =
        Object.keys(values).length === 0
          ? this.db
              .selectFrom('notification_type')
              .selectAll()
              .where('id', '=', id)
          : this.db
              .updateTable('notification_type')
              .set(values)
              .where('id', '=', id)
              .returningAll();
      const row = await query.executeTakeFirst();
      if (row === undefined) {
        throw new NotFoundError('Notification type not found');
      }
      return toNotificationType(row);
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /**
   * Deletes a notification type that was never used (back office). A type with notifications or preferences cannot be
   * deleted. The caller checks the admin role.
   * Errors: `NotFoundError`, `InvalidStateError` (the type is in use).
   */
  async deleteNotificationType(id: string): Promise<void> {
    try {
      const result = await this.db
        .deleteFrom('notification_type')
        .where('id', '=', id)
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) {
        throw new NotFoundError('Notification type not found');
      }
    } catch (err) {
      throw mapDbError(err, NOTIFICATION_CONSTRAINTS);
    }
  }

  /** Loads a notification type by code. Throws `InvalidReferenceError` when unknown. */
  private async typeByCode(
    db: Kysely<DB>,
    code: string,
  ): Promise<NotificationTypeRow> {
    const row = await db
      .selectFrom('notification_type')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();
    if (row === undefined) {
      throw new InvalidReferenceError('Unknown notification type');
    }
    return row;
  }

  /**
   * Existing recipients among `userIds`, deduplicated, with their effective channels for the type (BR-NOT-01).
   * With `actorId`, the actor and users blocked with the actor are left out (BR-SOC-02).
   */
  private async recipients(
    db: Kysely<DB>,
    typeId: string,
    userIds: string[],
    actorId?: string,
  ): Promise<{ user_id: string; push: boolean; in_app: boolean }[]> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return [];
    }
    const actorFilter =
      actorId === undefined
        ? sql``
        : sql`AND u.id <> ${actorId}::uuid AND NOT ${blockedBetween(asUuid(actorId), sql<string>`u.id`)}`;
    const result = await sql<{
      user_id: string;
      push: boolean;
      in_app: boolean;
    }>`
      SELECT u.id AS user_id,
        COALESCE(p.push_enabled, t.default_push) AS push,
        COALESCE(p.in_app_enabled, t.default_in_app) AS in_app
      FROM user_account u
      JOIN notification_type t ON t.id = ${typeId}::uuid
      LEFT JOIN notification_preference p ON p.user_id = u.id AND p.notification_type_id = t.id
      WHERE u.id = ANY(${unique}::uuid[])
        ${actorFilter}
      ORDER BY u.id
    `.execute(db);
    return result.rows;
  }

  /** Push subscriptions of the given users. */
  private async pushTargetsOf(
    db: Kysely<DB>,
    userIds: string[],
  ): Promise<PushTarget[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await db
      .selectFrom('push_subscription')
      .select(['user_id', 'id', 'endpoint', 'p256dh', 'auth_secret'])
      .where('user_id', 'in', userIds)
      .orderBy('user_id')
      .orderBy('id')
      .execute();
    return rows.map(toPushTarget);
  }
}

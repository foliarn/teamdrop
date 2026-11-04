import { resolve } from 'node:path';
import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { appDb, ownerDb, runSqlFile, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import { codeOf, newUser } from './helpers/event-helpers';

// __tests__ -> data -> src -> api -> apps -> repository root
const notificationTypeSeed = resolve(
  __dirname,
  '../../../../../db/seeds/reference/050_notification_type.sql',
);

describe('Notifications (batch 2)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const blocks = new BlockRepository(db);
  const notifications = new NotificationRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /** Saves a push subscription with fake keys for a user. */
  const device = (userId: string, name: string) =>
    notifications.savePushSubscription(userId, {
      endpoint: `https://push.test/${name}`,
      p256dh: `p256dh-${name}`,
      authSecret: `auth-${name}`,
      userAgent: `Browser ${name}`,
    });

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
    await runSqlFile(owner, notificationTypeSeed);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('types (reference data)', () => {
    it('BR-NOT-01, BR-TECH-12: the approved notification types are seeded with stable codes', async () => {
      const types = await notifications.listNotificationTypes();
      expect(types.map((t) => t.code)).toEqual(
        [
          'new_message',
          'looking_for_players',
          'event_updated',
          'occurrence_cancelled',
          'waitlist_promoted',
          'registration_approved',
          'registration_declined',
          'block_shared_occurrence',
          'follow_request',
          'new_follower',
          'circle_invitation',
          'community_join_decided',
          'dispute_resolved',
          'cheer_received',
        ].sort(),
      );
      expect(types.find((t) => t.code === 'new_message')).toMatchObject({
        defaultPush: true,
        defaultInApp: false,
      });
    });

    it('BR-TECH-12: the back office creates, updates and deletes unused types; a used type is protected', async () => {
      const created = await notifications.createNotificationType({
        code: 'test_type',
        name: 'Test type',
        defaultPush: false,
        defaultInApp: true,
      });
      expect(
        await codeOf(() =>
          notifications.createNotificationType({
            code: 'test_type',
            name: 'Again',
            defaultPush: true,
            defaultInApp: true,
          }),
        ),
      ).toBe('INVALID_INPUT');
      const updated = await notifications.updateNotificationType(created.id, {
        name: 'Renamed',
        defaultPush: true,
      });
      expect(updated).toMatchObject({
        code: 'test_type',
        name: 'Renamed',
        defaultPush: true,
        defaultInApp: true,
      });

      const a = await user('typeuser');
      await notifications.notify('test_type', [a]);
      expect(
        await codeOf(() => notifications.deleteNotificationType(created.id)),
      ).toBe('INVALID_STATE');

      const unused = await notifications.createNotificationType({
        code: 'unused_type',
        name: 'Unused',
        defaultPush: false,
        defaultInApp: false,
      });
      await notifications.deleteNotificationType(unused.id);
      expect(
        await codeOf(() => notifications.deleteNotificationType(unused.id)),
      ).toBe('NOT_FOUND');
      expect(
        await codeOf(() =>
          notifications.updateNotificationType(unused.id, { name: 'Gone' }),
        ),
      ).toBe('NOT_FOUND');
    });
  });

  describe('notify', () => {
    it('BR-NOT-01: type defaults decide the channels when the user has no preference', async () => {
      const a = await user('defaulta');
      await device(a, 'defaulta-phone');
      const inApp = await notifications.notify('event_updated', [a], {
        eventId: 'e1',
      });
      expect(inApp.inAppUserIds).toEqual([a]);
      expect(inApp.pushTargets).toEqual([
        expect.objectContaining({
          userId: a,
          endpoint: 'https://push.test/defaulta-phone',
          p256dh: 'p256dh-defaulta-phone',
          authSecret: 'auth-defaulta-phone',
        }),
      ]);
      // new_message: push only by default.
      const pushOnly = await notifications.notify('new_message', [a]);
      expect(pushOnly.notificationIds).toEqual([]);
      expect(pushOnly.pushTargets).toHaveLength(1);
    });

    it('BR-NOT-01: a preference per type and channel overrides the defaults', async () => {
      const a = await user('prefa');
      await device(a, 'prefa-phone');
      await notifications.setPreference(a, 'event_updated', { push: false });
      const outcome = await notifications.notify('event_updated', [a]);
      expect(outcome.inAppUserIds).toEqual([a]);
      expect(outcome.pushTargets).toEqual([]);

      await notifications.setPreference(a, 'event_updated', { inApp: false });
      const none = await notifications.notify('event_updated', [a]);
      expect(none).toEqual({
        notificationIds: [],
        inAppUserIds: [],
        pushTargets: [],
      });
    });

    it('BR-SOC-02: with an actor, the actor and users blocked with the actor are not notified', async () => {
      const actor = await user('actor');
      const friend = await user('actorfriend');
      const blocked = await user('actorblocked');
      await blocks.block(blocked, actor);
      const outcome = await notifications.notify(
        'occurrence_cancelled',
        [actor, friend, blocked, friend],
        { occurrenceId: 'o1' },
        { actorId: actor },
      );
      expect(outcome.inAppUserIds).toEqual([friend]);
    });

    it('BR-NOT-01: unknown users are skipped, unknown types and bad payloads are refused', async () => {
      const a = await user('skipa');
      const outcome = await notifications.notify('event_updated', [
        a,
        '00000000-0000-7000-8000-00000000dead',
      ]);
      expect(outcome.inAppUserIds).toEqual([a]);
      expect(await codeOf(() => notifications.notify('nope', [a]))).toBe(
        'INVALID_REFERENCE',
      );
      expect(
        await codeOf(() =>
          notifications.notify(
            'event_updated',
            [a],
            [] as unknown as Record<string, unknown>,
          ),
        ),
      ).toBe('INVALID_INPUT');
      expect(await notifications.notify('event_updated', [])).toEqual({
        notificationIds: [],
        inAppUserIds: [],
        pushTargets: [],
      });
    });

    it('BR-MSG-02: listPushTargets applies the push preference without creating in-app notifications', async () => {
      const a = await user('targeta');
      const b = await user('targetb');
      await device(a, 'targeta-1');
      await device(a, 'targeta-2');
      await device(b, 'targetb-1');
      await notifications.setPreference(b, 'new_message', { push: false });
      const targets = await notifications.listPushTargets('new_message', [
        a,
        b,
      ]);
      expect(targets.map((t) => t.endpoint).sort()).toEqual([
        'https://push.test/targeta-1',
        'https://push.test/targeta-2',
      ]);
      expect(await notifications.countUnread(a)).toBe(0);
    });
  });

  describe('in-app notifications', () => {
    it('BR-NOT-01: lists newest first by pages, counts and marks read, deletes own rows only', async () => {
      const a = await user('inboxa');
      const b = await user('inboxb');
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const outcome = await notifications.notify('new_follower', [a], {
          index: i,
        });
        ids.push(outcome.notificationIds[0]);
      }
      const first = await notifications.listNotifications(a, { limit: 3 });
      expect(first.items.map((n) => n.id)).toEqual(ids.slice(2).reverse());
      expect(first.items[0]).toMatchObject({
        typeCode: 'new_follower',
        payload: { index: 4 },
        readAt: null,
      });
      const second = await notifications.listNotifications(a, {
        cursor: first.nextCursor ?? undefined,
        limit: 3,
      });
      expect(second.items.map((n) => n.id)).toEqual(ids.slice(0, 2).reverse());
      expect(second.nextCursor).toBeNull();

      expect(await notifications.countUnread(a)).toBe(5);
      expect(await notifications.markRead(b, [ids[0]])).toEqual({ updated: 0 });
      expect(await notifications.markRead(a, [ids[0], ids[1]])).toEqual({
        updated: 2,
      });
      expect(await notifications.markRead(a, [ids[0]])).toEqual({ updated: 0 });
      const unread = await notifications.listNotifications(a, {
        unreadOnly: true,
      });
      expect(unread.items).toHaveLength(3);
      expect(await notifications.markAllRead(a)).toEqual({ updated: 3 });
      expect(await notifications.countUnread(a)).toBe(0);

      expect(
        await codeOf(() => notifications.deleteNotification(b, ids[0])),
      ).toBe('NOT_FOUND');
      await notifications.deleteNotification(a, ids[0]);
      expect(
        (await notifications.listNotifications(a)).items.map((n) => n.id),
      ).not.toContain(ids[0]);
    });
  });

  describe('preferences', () => {
    it('BR-ACC-15: lists effective preferences and sets one channel without changing the other', async () => {
      const a = await user('prefsa');
      const before = await notifications.listPreferences(a);
      expect(before).toHaveLength(
        (await notifications.listNotificationTypes()).length,
      );
      expect(before.every((p) => p.isDefault)).toBe(true);
      expect(before.find((p) => p.typeCode === 'new_follower')).toMatchObject({
        push: false,
        inApp: true,
      });

      expect(
        await notifications.setPreference(a, 'new_follower', { push: true }),
      ).toMatchObject({ push: true, inApp: true, isDefault: false });
      expect(
        await notifications.setPreference(a, 'new_follower', { inApp: false }),
      ).toMatchObject({ push: true, inApp: false });
      const after = await notifications.listPreferences(a);
      expect(after.find((p) => p.typeCode === 'new_follower')).toMatchObject({
        push: true,
        inApp: false,
        isDefault: false,
      });
      expect(
        await codeOf(() => notifications.setPreference(a, 'nope', {})),
      ).toBe('INVALID_REFERENCE');
    });
  });

  describe('push subscriptions', () => {
    it('BR-NOT-01: one subscription per device; a device moves to the user who logs in on it', async () => {
      const a = await user('pusha');
      const b = await user('pushb');
      const first = await device(a, 'shared');
      const again = await device(b, 'shared');
      expect(again.id).toBe(first.id);
      expect(await notifications.listMyPushSubscriptions(a)).toEqual([]);
      const mine = await notifications.listMyPushSubscriptions(b);
      expect(mine).toEqual([
        {
          id: first.id,
          userAgent: 'Browser shared',
          createdAt: expect.any(Date) as unknown,
          lastUsedAt: null,
        },
      ]);
      expect(Object.keys(mine[0])).not.toContain('authSecret');
    });

    it('BR-NOT-01: deletes own devices, removes expired endpoints and records use', async () => {
      const a = await user('devicea');
      const b = await user('deviceb');
      const phone = await device(a, 'devicea-phone');
      await device(a, 'devicea-laptop');
      expect(
        await codeOf(() =>
          notifications.deletePushSubscription(
            b,
            'https://push.test/devicea-phone',
          ),
        ),
      ).toBe('NOT_FOUND');
      await notifications.markPushSubscriptionsUsed([phone.id]);
      const listed = await notifications.listMyPushSubscriptions(a);
      expect(listed.find((s) => s.id === phone.id)?.lastUsedAt).toBeInstanceOf(
        Date,
      );
      await notifications.deletePushSubscription(
        a,
        'https://push.test/devicea-phone',
      );
      expect(
        await notifications.removeExpiredPushSubscription(
          'https://push.test/devicea-laptop',
        ),
      ).toEqual({ removed: true });
      expect(
        await notifications.removeExpiredPushSubscription(
          'https://push.test/devicea-laptop',
        ),
      ).toEqual({ removed: false });
      expect(await notifications.listMyPushSubscriptions(a)).toEqual([]);
      expect(
        await codeOf(() =>
          notifications.savePushSubscription(a, {
            endpoint: '',
            p256dh: 'x',
            authSecret: 'y',
          }),
        ),
      ).toBe('INVALID_INPUT');
    });
  });
});

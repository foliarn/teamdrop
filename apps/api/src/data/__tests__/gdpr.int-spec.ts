import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { AuthRepository } from '../repositories/auth.repository';
import { CheerRepository } from '../repositories/cheer.repository';
import { CircleRepository } from '../repositories/circle.repository';
import { EventRepository } from '../repositories/event.repository';
import { GdprRepository } from '../repositories/gdpr.repository';
import { MessageRepository } from '../repositories/message.repository';
import { NotificationRepository } from '../repositories/notification.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { ReportRepository } from '../repositories/report.repository';
import { StatsRepository } from '../repositories/stats.repository';
import { appDb, ownerDb, runSqlFile, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
} from './helpers/event-helpers';

// __tests__ -> data -> src -> api -> apps -> repository root
const seed = (file: string) =>
  resolve(__dirname, '../../../../../db/seeds/reference', file);

describe('GDPR (batch 6)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const cheers = new CheerRepository(db);
  const circles = new CircleRepository(db);
  const events = new EventRepository(db);
  const gdpr = new GdprRepository(db);
  const messages = new MessageRepository(db);
  const notifications = new NotificationRepository(db);
  const registrations = new RegistrationRepository(db);
  const reports = new ReportRepository(db);
  const stats = new StatsRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  const runJobs = async () =>
    (
      await sql<{
        r: Record<string, number>;
      }>`SELECT run_gdpr_jobs() AS r`.execute(owner)
    ).rows[0].r;

  /** Makes the deletion request of a user older than the grace period (owner connection, simulates the clock). */
  async function requestDeletionDaysAgo(userId: string, days: number) {
    await owner
      .updateTable('user_account')
      .set({ deletion_requested_at: new Date(Date.now() - days * 86_400_000) })
      .where('id', '=', userId)
      .execute();
  }

  /** A published one-off event `hours` from now. */
  async function eventIn(
    organizer: string,
    hours: number,
    maxParticipants = 10,
  ) {
    const when = localIn(hours);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate: when.date,
        startTime: when.time,
        maxParticipants,
      }),
    );
    await events.publishEvent(eventId);
    return { eventId, key: { eventId, date: when.date } };
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
    await runSqlFile(owner, seed('080_consent_purpose.sql'));
    await runSqlFile(owner, seed('060_cheer_type.sql'));
    await runSqlFile(owner, seed('070_report_reason.sql'));
    await runSqlFile(owner, seed('050_notification_type.sql'));
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('policies and consents (BR-GDP-01)', () => {
    it('BR-GDP-01: required consents accept the current policy version and must be renewed with a new version', async () => {
      const a = await user('consenta');
      expect(
        await codeOf(() => gdpr.recordConsent(a, 'terms_of_service', true)),
      ).toBe('INVALID_STATE');
      await gdpr.publishPolicyVersion(
        'terms_of_service',
        '2026-11',
        'https://teamdrop.test/terms/2026-11',
      );
      await gdpr.publishPolicyVersion(
        'privacy_policy',
        '2026-11',
        'https://teamdrop.test/privacy/2026-11',
      );
      await gdpr.recordConsent(a, 'terms_of_service', true);
      await gdpr.recordConsent(a, 'privacy_policy', true);
      await gdpr.recordConsent(a, 'geolocation', true);
      await gdpr.recordConsent(a, 'geolocation', false);

      const state = await gdpr.getMyConsents(a);
      expect(
        state.find((c) => c.purposeCode === 'terms_of_service'),
      ).toMatchObject({
        granted: true,
        policyVersion: '2026-11',
        upToDate: true,
      });
      expect(state.find((c) => c.purposeCode === 'geolocation')).toMatchObject({
        granted: false,
        upToDate: true,
      });
      expect(
        state.find((c) => c.purposeCode === 'analytics')?.granted,
      ).toBeNull();

      await new Promise((r) => setTimeout(r, 5));
      await gdpr.publishPolicyVersion(
        'terms_of_service',
        '2027-01',
        'https://teamdrop.test/terms/2027-01',
      );
      expect(
        (await gdpr.getMyConsents(a)).find(
          (c) => c.purposeCode === 'terms_of_service',
        )?.upToDate,
      ).toBe(false);
      expect((await gdpr.getCurrentPolicies()).terms_of_service?.version).toBe(
        '2027-01',
      );
      expect(
        (await gdpr.listConsentHistory(a)).map((c) => c.purposeCode),
      ).toEqual([
        'terms_of_service',
        'privacy_policy',
        'geolocation',
        'geolocation',
      ]);
      expect(
        await codeOf(() =>
          gdpr.publishPolicyVersion(
            'terms_of_service',
            '2027-01',
            'https://x.test',
          ),
        ),
      ).toBe('INVALID_INPUT');
      expect(await codeOf(() => gdpr.recordConsent(a, 'nope', true))).toBe(
        'INVALID_REFERENCE',
      );
    });

    it('BR-GDP-01: consents are append-only for the application role', async () => {
      const a = await user('appendonly');
      await gdpr.recordConsent(a, 'analytics', true);
      await expect(
        sql`UPDATE user_consent SET granted = false WHERE user_id = ${a}::uuid`.execute(
          db,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        sql`DELETE FROM user_consent WHERE user_id = ${a}::uuid`.execute(db),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('data export (BR-GDP-07)', () => {
    it('BR-GDP-07: one request at a time, claimed, built, ready for 7 days, then expired and deleted', async () => {
      const a = await user('exporta');
      const first = await gdpr.requestExport(a);
      const again = await gdpr.requestExport(a);
      expect(again.id).toBe(first.id);

      const claimed = await gdpr.claimNextExport();
      expect(claimed).toEqual({ requestId: first.id, userId: a });
      expect(await gdpr.claimNextExport()).toBeNull();

      const data = await gdpr.buildExportData(a);
      expect(data.account).toMatchObject({
        id: a,
        email: `${(data.account as { username: string }).username}@events.test`,
        birthDate: '1990-01-01',
      });
      expect(data).toHaveProperty('messages');
      expect(data).toHaveProperty('consents');

      await gdpr.completeExport(first.id, `/exports/${first.id}.json`);
      const [ready] = await gdpr.listMyExports(a);
      expect(ready.status).toBe('ready');
      expect(ready.expiresAt!.getTime() - ready.completedAt!.getTime()).toBe(
        7 * 86_400_000,
      );
      expect(
        await codeOf(() => gdpr.completeExport(first.id, '/again.json')),
      ).toBe('INVALID_STATE');

      // A new request is allowed once the previous one is done.
      const second = await gdpr.requestExport(a);
      expect(second.id).not.toBe(first.id);
      expect((await gdpr.claimNextExport())?.requestId).toBe(second.id);
      await gdpr.failExport(second.id);

      await owner
        .updateTable('data_export_request')
        .set({ expires_at: new Date(Date.now() - 1000) })
        .where('id', '=', first.id)
        .execute();
      expect((await runJobs()).expiredExports).toBe(1);
      expect(await gdpr.listExpiredExportFiles()).toEqual([
        { requestId: first.id, filePath: `/exports/${first.id}.json` },
      ]);
      await gdpr.markExportFileDeleted(first.id);
      expect(await gdpr.listExpiredExportFiles()).toEqual([]);
    });

    it('BR-GDP-07: a failed export can be requested again', async () => {
      const a = await user('exportfail');
      const request = await gdpr.requestExport(a);
      expect((await gdpr.claimNextExport())?.requestId).toBe(request.id);
      await gdpr.failExport(request.id);
      expect((await gdpr.requestExport(a)).id).not.toBe(request.id);
      expect(await codeOf(() => gdpr.buildExportData(randomUUID()))).toBe(
        'NOT_FOUND',
      );
    });
  });

  describe('erasure (BR-GDP-03 to BR-GDP-05)', () => {
    it('BR-GDP-03: an account is erased only after the 30-day grace period', async () => {
      const a = await user('graceful');
      expect(await codeOf(() => gdpr.eraseAccount(a))).toBe('INVALID_STATE');
      await requestDeletionDaysAgo(a, 29);
      expect(await gdpr.listDueErasures()).not.toContain(a);
      expect(await codeOf(() => gdpr.eraseAccount(a))).toBe('INVALID_STATE');
    });

    it('BR-GDP-04, BR-GDP-05: places freed, events transferred or cancelled, traces kept without identity', async () => {
      const leaver = await user('leaver');
      const coOrganizer = await user('coorg');
      const participant = await user('participant');
      const waiting = await user('waiting');
      const friend = await user('friend');

      // An event with a co-organizer: transferred.
      const shared = await eventIn(leaver, 72);
      await events.addCoOrganizer(shared.eventId, coOrganizer, false);
      // An event without co-organizer, with a participant: cancelled.
      const solo = await eventIn(leaver, 96);
      await registrations.register(solo.key, participant);
      // The leaver holds the only place of someone else's session; waiting is on the waitlist: promoted.
      const full = await eventIn(friend, 48, 1);
      await registrations.register(full.key, leaver);
      await registrations.register(full.key, waiting);

      // A past session with friend: friend's "people met" must survive (BR-GDP-05).
      const past = await eventIn(friend, 120);
      await registrations.register(past.key, leaver);
      const pastOccurrence = await firstOccurrenceId(owner, past.eventId);
      await owner
        .updateTable('event_occurrence')
        .set({
          status: 'completed',
          starts_at: new Date(Date.now() - 2 * 86_400_000),
        })
        .where('id', '=', pastOccurrence)
        .execute();
      await owner
        .updateTable('registration')
        .set({ attendance: 'attended' })
        .where('occurrence_id', '=', pastOccurrence)
        .execute();
      await owner
        .updateTable('event')
        .set({ owner_counts_toward_capacity: true })
        .where('id', '=', past.eventId)
        .execute();
      await owner
        .insertInto('registration')
        .values({
          occurrence_id: pastOccurrence,
          user_id: friend,
          status: 'confirmed',
          attendance: 'attended',
        })
        .execute();
      await cheers.giveCheer(leaver, friend, past.key, 'fair_play');

      // A message in a circle, and a report filed by the leaver.
      const circle = await circles.createCircle(friend, {
        name: 'GDPR circle',
      });
      const invitation = await circles.invite(circle.id, friend, leaver);
      await circles.respondToInvitation(invitation.invitationId, leaver, true);
      const conversationId =
        (await messages.getConversationId({ circleId: circle.id })) ?? '';
      const sent = await messages.sendMessage(leaver, conversationId, {
        clientMessageId: randomUUID(),
        body: 'See you',
      });
      const { reportId } = await reports.createReport(leaver, {
        reasonCode: 'spam',
        target: { userId: friend },
      });
      await gdpr.publishPolicyVersion(
        'privacy_policy',
        `v-${randomUUID()}`,
        'https://x.test',
      );
      await gdpr.recordConsent(leaver, 'privacy_policy', true);
      const metBefore = (await stats.getProfileStats(friend, friend))
        ?.peopleMet;

      await requestDeletionDaysAgo(leaver, 31);
      expect(await gdpr.listDueErasures()).toContain(leaver);
      const [outcome] = (await gdpr.eraseDueAccounts()).filter(
        (o) => o.userId === leaver,
      );

      expect(outcome.promotedUserIds).toEqual([waiting]);
      expect(outcome.transferredEvents).toEqual([
        { eventId: shared.eventId, newOwnerId: coOrganizer },
      ]);
      expect(outcome.cancelledOccurrences).toEqual([
        {
          occurrenceId: await firstOccurrenceId(owner, solo.eventId),
          eventId: solo.eventId,
          participantUserIds: [participant],
        },
      ]);

      const remaining = await owner
        .selectFrom('user_account')
        .select('id')
        .where('id', '=', leaver)
        .execute();
      expect(remaining).toEqual([]);
      const soloEvent = await owner
        .selectFrom('event')
        .select(['owner_id', 'status'])
        .where('id', '=', solo.eventId)
        .executeTakeFirstOrThrow();
      expect(soloEvent).toEqual({ owner_id: null, status: 'cancelled' });
      const sharedEvent = await owner
        .selectFrom('event')
        .select('owner_id')
        .where('id', '=', shared.eventId)
        .executeTakeFirstOrThrow();
      expect(sharedEvent.owner_id).toBe(coOrganizer);

      // Traces kept without the identity.
      expect(
        (await messages.getMessage(friend, sent.message.id))?.sender,
      ).toBeNull();
      expect(
        (await cheers.listReceivedCheers(friend)).items[0].giver,
      ).toBeNull();
      expect((await reports.getReport(reportId)).reporterId).toBeNull();
      expect((await stats.getProfileStats(friend, friend))?.peopleMet).toBe(
        metBefore,
      );
      const consents = await owner
        .selectFrom('user_consent')
        .select(['granted'])
        .where('user_id', 'is', null)
        .execute();
      expect(consents.filter((c) => !c.granted).length).toBeGreaterThanOrEqual(
        6,
      );
    });
  });

  describe('inactivity and retention (BR-GDP-08, BR-GDP-09, BR-MSG-05)', () => {
    it('BR-GDP-08: warning at 12 months, deletion at 24 months, reset on activity', async () => {
      const sleeper = await user('sleeper');
      const back = await user('comeback');
      await owner
        .updateTable('user_account')
        .set({ last_active_at: new Date(Date.now() - 400 * 86_400_000) })
        .where('id', 'in', [sleeper, back])
        .execute();
      const toWarn = await gdpr.listInactiveAccountsToWarn();
      expect(toWarn.map((u) => u.userId)).toEqual(
        expect.arrayContaining([sleeper, back]),
      );
      expect(toWarn.find((u) => u.userId === sleeper)?.email).toMatch(
        /^sleeper\d+@events\.test$/,
      );
      await gdpr.markInactivityWarned([sleeper, back]);
      expect(
        (await gdpr.listInactiveAccountsToWarn()).map((u) => u.userId),
      ).not.toContain(sleeper);

      // 25 months inactive, warned 13 months ago: scheduled for deletion. back logged in again: no longer warned.
      await owner
        .updateTable('user_account')
        .set({
          last_active_at: new Date(Date.now() - 760 * 86_400_000),
          inactivity_warned_at: new Date(Date.now() - 395 * 86_400_000),
        })
        .where('id', '=', sleeper)
        .execute();
      await owner
        .updateTable('user_account')
        .set({ last_active_at: new Date() })
        .where('id', '=', back)
        .execute();
      const result = await runJobs();
      expect(result.inactiveAccountsScheduled).toBeGreaterThanOrEqual(1);
      expect(result.reactivatedAccounts).toBeGreaterThanOrEqual(1);
      expect(await gdpr.listDueErasures()).toContain(sleeper);
      const backRow = await owner
        .selectFrom('user_account')
        .select('inactivity_warned_at')
        .where('id', '=', back)
        .executeTakeFirstOrThrow();
      expect(backRow.inactivity_warned_at).toBeNull();
    });

    it('BR-GDP-09, BR-MSG-05: retention purges', async () => {
      const organizer = await user('purgeorg');
      const reporter = await user('purgereporter');
      const { key, eventId } = await eventIn(organizer, 48);
      await registrations.register(key, reporter);
      const conversationId = await messages.getOrCreateOccurrenceConversation(
        organizer,
        key,
      );
      const kept = await messages.sendMessage(organizer, conversationId, {
        clientMessageId: randomUUID(),
        body: 'Reported',
      });
      await messages.sendMessage(organizer, conversationId, {
        clientMessageId: randomUUID(),
        body: 'Old',
      });
      await reports.createReport(reporter, {
        reasonCode: 'spam',
        target: { messageId: kept.message.id },
      });
      await owner
        .updateTable('event_occurrence')
        .set({ starts_at: new Date(Date.now() - 400 * 86_400_000) })
        .where('event_id', '=', eventId)
        .execute();

      await notifications.notify('new_follower', [organizer]);
      await owner
        .updateTable('notification')
        .set({ created_at: new Date(Date.now() - 91 * 86_400_000) })
        .where('user_id', '=', organizer)
        .execute();
      await auth.issueRefreshToken({
        userId: organizer,
        token: randomUUID(),
        expiresAt: new Date(Date.now() - 31 * 86_400_000),
      });
      await owner
        .insertInto('audit_log')
        .values({
          action: 'other',
          created_at: new Date(Date.now() - 1100 * 86_400_000),
        })
        .execute();

      const result = await runJobs();
      expect(result.occurrenceMessages).toBe(1);
      expect(result.notifications).toBeGreaterThanOrEqual(1);
      expect(result.refreshTokens).toBeGreaterThanOrEqual(1);
      expect(result.auditEntries).toBeGreaterThanOrEqual(1);
      const left = await owner
        .selectFrom('message')
        .select('body')
        .where('conversation_id', '=', conversationId)
        .execute();
      expect(left).toEqual([{ body: 'Reported' }]);
    });
  });
});

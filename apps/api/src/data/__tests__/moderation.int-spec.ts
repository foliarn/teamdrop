import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AttendanceRepository } from '../repositories/attendance.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuthRepository } from '../repositories/auth.repository';
import { CircleRepository } from '../repositories/circle.repository';
import { EventRepository } from '../repositories/event.repository';
import { MessageRepository } from '../repositories/message.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { ReportRepository } from '../repositories/report.repository';
import { SanctionRepository } from '../repositories/sanction.repository';
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
const reportReasonSeed = resolve(
  __dirname,
  '../../../../../db/seeds/reference/070_report_reason.sql',
);

describe('Moderation (batch 3)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const attendance = new AttendanceRepository(db);
  const audit = new AuditLogRepository(db);
  const circles = new CircleRepository(db);
  const events = new EventRepository(db);
  const messages = new MessageRepository(db);
  const registrations = new RegistrationRepository(db);
  const reports = new ReportRepository(db);
  const sanctions = new SanctionRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /** Input of a password sign-up with the given email. */
  const signUp = (username: string, email: string) => ({
    username,
    email,
    passwordHash: '$argon2id$placeholder',
    firstName: 'Signup',
    birthDate: '1990-01-01',
    municipalityId: refs.municipalities.paris8,
  });

  /** A circle of `ownerId` and `memberId`, with a message from `memberId`. */
  async function circleMessage(ownerId: string, memberId: string) {
    const circle = await circles.createCircle(ownerId, { name: 'Mod circle' });
    const invitation = await circles.invite(circle.id, ownerId, memberId);
    await circles.respondToInvitation(invitation.invitationId, memberId, true);
    const conversationId =
      (await messages.getConversationId({ circleId: circle.id })) ?? '';
    const sent = await messages.sendMessage(memberId, conversationId, {
      clientMessageId: randomUUID(),
      body: 'Something rude',
    });
    return { circleId: circle.id, conversationId, messageId: sent.message.id };
  }

  async function auditActions(targetId: string): Promise<string[]> {
    const page = await audit.list({ targetId });
    return page.items.map((entry) => entry.action);
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
    await runSqlFile(owner, reportReasonSeed);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('reports', () => {
    it('BR-MOD-01: reports exactly one user, event or message with an active reason', async () => {
      const reporter = await user('reporter');
      const target = await user('reported');
      const when = localIn(48);
      const { eventId } = await events.createEvent(
        target,
        eventInput(refs, { startDate: when.date, startTime: when.time }),
      );
      const { messageId } = await circleMessage(reporter, target);

      const onUser = await reports.createReport(reporter, {
        reasonCode: 'harassment',
        target: { userId: target },
        details: 'Insults after the match',
      });
      await reports.createReport(reporter, {
        reasonCode: 'no_show_organizer_or_fake_event',
        target: { eventId },
      });
      await reports.createReport(reporter, {
        reasonCode: 'hate_speech',
        target: { messageId },
      });
      const mine = await reports.listMyReports(reporter);
      expect(mine.map((r) => r.targetKind).sort()).toEqual([
        'event',
        'message',
        'user',
      ]);
      expect(mine.every((r) => r.status === 'open')).toBe(true);
      expect((await reports.getReport(onUser.reportId)).details).toBe(
        'Insults after the match',
      );
    });

    it('BR-MOD-01: refuses zero or two targets, unknown reasons, self reports and invisible messages', async () => {
      const reporter = await user('badreporter');
      const target = await user('badtarget');
      const outsider = await user('badoutsider');
      const { messageId } = await circleMessage(target, reporter);
      expect(
        await codeOf(() =>
          reports.createReport(reporter, {
            reasonCode: 'spam',
            target: { userId: target, eventId: target },
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          reports.createReport(reporter, {
            reasonCode: 'spam',
            target: {} as unknown as { userId: string },
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          reports.createReport(reporter, {
            reasonCode: 'nope',
            target: { userId: target },
          }),
        ),
      ).toBe('INVALID_REFERENCE');
      expect(
        await codeOf(() =>
          reports.createReport(reporter, {
            reasonCode: 'spam',
            target: { userId: reporter },
          }),
        ),
      ).toBe('SELF_ACTION');
      expect(
        await codeOf(() =>
          reports.createReport(outsider, {
            reasonCode: 'spam',
            target: { messageId },
          }),
        ),
      ).toBe('NOT_FOUND');
    });

    it('BR-MOD-02, BR-MOD-05: assign, resolve and dismiss are audited; a closed report cannot change', async () => {
      const reporter = await user('flowreporter');
      const target = await user('flowtarget');
      const moderator = await user('flowmoderator');
      const first = await reports.createReport(reporter, {
        reasonCode: 'spam',
        target: { userId: target },
      });
      const second = await reports.createReport(reporter, {
        reasonCode: 'fake_profile',
        target: { userId: target },
      });

      await reports.assignReport(first.reportId, moderator);
      expect(
        (
          await reports.listReports({ assignedModeratorId: moderator })
        ).items.map((r) => r.id),
      ).toEqual([first.reportId]);
      await reports.resolveReport(first.reportId, moderator, 'Warned the user');
      await reports.dismissReport(second.reportId, moderator, 'Not a fake');

      const resolved = await reports.getReport(first.reportId);
      expect(resolved).toMatchObject({
        status: 'resolved',
        assignedModeratorId: moderator,
        resolutionNote: 'Warned the user',
        targetDetails: { kind: 'user', userId: target },
      });
      expect(resolved.closedAt).toBeInstanceOf(Date);
      expect((await reports.getReport(second.reportId)).status).toBe(
        'dismissed',
      );
      expect(await auditActions(first.reportId)).toEqual([
        'report.resolved',
        'report.assigned',
      ]);
      expect(await auditActions(second.reportId)).toEqual(['report.dismissed']);

      expect(
        await codeOf(() => reports.assignReport(first.reportId, moderator)),
      ).toBe('INVALID_STATE');
      expect(
        await codeOf(() =>
          reports.resolveReport(second.reportId, moderator, 'Again'),
        ),
      ).toBe('INVALID_STATE');
      const third = await reports.createReport(reporter, {
        reasonCode: 'other',
        target: { userId: target },
      });
      expect(
        await codeOf(() =>
          reports.resolveReport(third.reportId, moderator, ' '),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-MOD-02: the queue lists open and assigned reports oldest first, by pages', async () => {
      const reporter = await user('queuereporter');
      const target = await user('queuetarget');
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          (
            await reports.createReport(reporter, {
              reasonCode: 'spam',
              target: { userId: target },
            })
          ).reportId,
        );
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await reports.listReports(
          { status: ['open', 'assigned'] },
          { cursor, limit: 2 },
        );
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      const mine = seen.filter((id) => ids.includes(id));
      expect(mine).toEqual(ids);
    });

    it('BR-GDP-04: a report is kept when its target is erased, with the target removed', async () => {
      const reporter = await user('keepreporter');
      const target = await user('keeptarget');
      const { reportId } = await reports.createReport(reporter, {
        reasonCode: 'harassment',
        target: { userId: target },
      });
      await owner.deleteFrom('user_account').where('id', '=', target).execute();
      const report = await reports.getReport(reportId);
      expect(report.target).toEqual({ kind: 'removed' });
      expect(report.targetDetails).toEqual({ kind: 'removed' });
    });

    it('BR-TECH-12: report reasons are managed from the back office', async () => {
      const created = await reports.createReportReason({
        code: 'cheating',
        name: 'Cheating',
        sortOrder: 11,
      });
      expect(
        await codeOf(() =>
          reports.createReportReason({
            code: 'cheating',
            name: 'X',
            sortOrder: 1,
          }),
        ),
      ).toBe('INVALID_INPUT');
      await reports.updateReportReason(created.id, { isActive: false });
      expect(
        (await reports.listReportReasons()).map((r) => r.code),
      ).not.toContain('cheating');
      expect(
        (await reports.listReportReasons()).map((r) => r.code),
      ).toHaveLength(10);
    });
  });

  describe('sanctions and bans', () => {
    it('BR-MOD-03: a warning and a temporary ban; the ban shows on login until it ends or is revoked', async () => {
      const moderator = await user('banmoderator');
      const target = await user('bantarget');
      const email = `bantarget${counter.value}@events.test`;
      await sanctions.issueSanction(moderator, {
        userId: target,
        kind: 'warning',
        reason: 'Be nice',
      });
      expect((await auth.findLoginByEmail(email))?.activeBan).toBeNull();

      const endsAt = new Date(Date.now() + 7 * 86_400_000);
      const { sanctionId } = await sanctions.issueSanction(moderator, {
        userId: target,
        kind: 'temporary_ban',
        reason: 'Spam',
        endsAt,
      });
      expect((await auth.findLoginByEmail(email))?.activeBan).toEqual({
        sanctionId,
        kind: 'temporary_ban',
        endsAt,
      });
      await sanctions.revokeSanction(sanctionId, moderator);
      expect(await sanctions.getActiveBan(target)).toBeNull();
      expect(
        await codeOf(() => sanctions.revokeSanction(sanctionId, moderator)),
      ).toBe('INVALID_STATE');
      expect(
        (await sanctions.listSanctions(target)).map((s) => s.kind),
      ).toEqual(['temporary_ban', 'warning']);
      expect(await auditActions(target)).toEqual([
        'sanction.revoked',
        'sanction.issued',
        'sanction.issued',
      ]);
    });

    it('BR-MOD-03: an ended temporary ban is no longer in force', async () => {
      const moderator = await user('endmoderator');
      const target = await user('endtarget');
      const { sanctionId } = await sanctions.issueSanction(moderator, {
        userId: target,
        kind: 'temporary_ban',
        reason: 'Cool down',
        endsAt: new Date(Date.now() + 86_400_000),
      });
      await owner
        .updateTable('user_sanction')
        .set({
          starts_at: new Date(Date.now() - 2 * 86_400_000),
          ends_at: new Date(Date.now() - 86_400_000),
        })
        .where('id', '=', sanctionId)
        .execute();
      expect(await sanctions.getActiveBan(target)).toBeNull();
    });

    it('BR-MOD-03: invalid sanctions are refused', async () => {
      const moderator = await user('badmoderator');
      const target = await user('badsanctioned');
      expect(
        await codeOf(() =>
          sanctions.issueSanction(moderator, {
            userId: target,
            kind: 'temporary_ban',
            reason: 'No end',
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          sanctions.issueSanction(moderator, {
            userId: target,
            kind: 'permanent_ban',
            reason: 'With end',
            endsAt: new Date(Date.now() + 86_400_000),
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          sanctions.issueSanction(moderator, {
            userId: target,
            kind: 'warning',
            reason: '  ',
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          sanctions.issueSanction(moderator, {
            userId: moderator,
            kind: 'warning',
            reason: 'Me',
          }),
        ),
      ).toBe('SELF_ACTION');
      expect(
        await codeOf(() =>
          sanctions.issueSanction(moderator, {
            userId: '00000000-0000-7000-8000-00000000dead',
            kind: 'warning',
            reason: 'Ghost',
          }),
        ),
      ).toBe('NOT_FOUND');
    });

    it('BR-MOD-04: a permanent ban blocks signing up again with the same email or Google identity, even after erasure', async () => {
      const moderator = await user('permmoderator');
      const { userId: target } = await auth.createUserWithGoogle({
        username: 'permtarget',
        email: 'Perm.Target@Example.test',
        emailVerified: true,
        googleSubject: 'google-perm-target',
        firstName: 'Perm',
        birthDate: '1990-01-01',
        municipalityId: refs.municipalities.paris8,
      });
      await sanctions.issueSanction(moderator, {
        userId: target,
        kind: 'permanent_ban',
        reason: 'Scam',
      });
      expect(
        (await auth.findUserByGoogleSubject('google-perm-target'))?.activeBan
          ?.kind,
      ).toBe('permanent_ban');

      await owner.deleteFrom('user_account').where('id', '=', target).execute();
      expect(
        await codeOf(() =>
          auth.createUserWithPassword(
            signUp('permagain', 'perm.target@example.test'),
          ),
        ),
      ).toBe('IDENTITY_BANNED');
      expect(
        await codeOf(() =>
          auth.createUserWithGoogle({
            username: 'permagain2',
            email: 'other.address@example.test',
            emailVerified: true,
            googleSubject: 'google-perm-target',
            firstName: 'Perm',
            birthDate: '1990-01-01',
            municipalityId: refs.municipalities.paris8,
          }),
        ),
      ).toBe('IDENTITY_BANNED');
      const someone = await user('permlinker');
      expect(
        await codeOf(() => auth.linkGoogle(someone, 'google-perm-target')),
      ).toBe('IDENTITY_BANNED');
      // Hashes only: the clear email is never stored.
      const stored = await owner
        .selectFrom('banned_identity')
        .select(['identity_kind'])
        .execute();
      expect(stored.map((r) => r.identity_kind).sort()).toEqual([
        'email',
        'google_subject',
      ]);
    });

    it('BR-MOD-04: revoking a permanent ban lets the person sign up again', async () => {
      const moderator = await user('unbanmoderator');
      const { userId: target } = await auth.createUserWithPassword(
        signUp('unbantarget', 'unban.target@example.test'),
      );
      const { sanctionId } = await sanctions.issueSanction(moderator, {
        userId: target,
        kind: 'permanent_ban',
        reason: 'Mistake',
      });
      await sanctions.revokeSanction(sanctionId, moderator);
      await owner.deleteFrom('user_account').where('id', '=', target).execute();
      await expect(
        auth.createUserWithPassword(
          signUp('unbanagain', 'unban.target@example.test'),
        ),
      ).resolves.toEqual({ userId: expect.any(String) as unknown });
    });

    it('BR-MOD-03, BR-MSG-03: content removal deletes the message, sanctions the author and is audited', async () => {
      const moderator = await user('removemoderator');
      const ownerId = await user('removeowner');
      const author = await user('removeauthor');
      const { conversationId, messageId } = await circleMessage(
        ownerId,
        author,
      );
      const { reportId } = await reports.createReport(ownerId, {
        reasonCode: 'inappropriate_content',
        target: { messageId },
      });
      const message = await reports.getReport(reportId);
      expect(message.targetDetails).toMatchObject({
        kind: 'message',
        senderId: author,
        body: 'Something rude',
      });

      const outcome = await sanctions.removeMessage(moderator, messageId, {
        reason: 'Insult',
        reportId,
      });
      expect(outcome.conversationId).toBe(conversationId);
      expect(await messages.getMessage(ownerId, messageId)).toBeNull();
      expect((await sanctions.listSanctions(author))[0]).toMatchObject({
        id: outcome.sanctionId,
        kind: 'content_removal',
        reportId,
      });
      expect((await reports.getReport(reportId)).target).toEqual({
        kind: 'removed',
      });
      const entries = await audit.list({ action: 'message.removed', reportId });
      expect(entries.items).toHaveLength(1);
      expect(JSON.stringify(entries.items[0].details)).not.toContain('rude');
      expect(
        await codeOf(() =>
          sanctions.removeMessage(moderator, messageId, { reason: 'Again' }),
        ),
      ).toBe('NOT_FOUND');
    });
  });

  describe('audit log (BR-MOD-05)', () => {
    it('handover item 6: rejecting a circle invitation records the admin', async () => {
      const ownerId = await user('rejectowner');
      const member = await user('rejectmember');
      const invitee = await user('rejectinvitee');
      const circle = await circles.createCircle(ownerId, { name: 'Reject' });
      const first = await circles.invite(circle.id, ownerId, member);
      await circles.respondToInvitation(first.invitationId, member, true);
      const invitation = await circles.invite(circle.id, member, invitee);
      expect(invitation.status).toBe('awaiting_admin');
      await circles.rejectInvitation(invitation.invitationId, ownerId);
      const page = await audit.list({ targetId: invitation.invitationId });
      expect(page.items).toEqual([
        expect.objectContaining({
          actorId: ownerId,
          action: 'circle.invitation_rejected',
          targetTable: 'circle_invitation',
          details: { circleId: circle.id, inviteeId: invitee },
        }),
      ]);
    });

    it('handover item 6: removing a participant records the organizer', async () => {
      const organizer = await user('removeorg');
      const participant = await user('removeparticipant');
      const when = localIn(48);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate: when.date, startTime: when.time }),
      );
      await events.publishEvent(eventId);
      const { registrationId } = await registrations.register(
        { eventId, date: when.date },
        participant,
      );
      await registrations.removeParticipant(registrationId, organizer);
      const page = await audit.list({ actorId: organizer });
      expect(page.items[0]).toMatchObject({
        action: 'registration.removed',
        targetTable: 'registration',
        targetId: registrationId,
        details: {
          occurrenceId: await firstOccurrenceId(owner, eventId),
          eventId,
        },
      });
    });

    it('BR-ATT-02: resolving a dispute is audited', async () => {
      const organizer = await user('disputeorg');
      const participant = await user('disputeparticipant');
      const moderator = await user('disputemoderator');
      const when = localIn(48);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate: when.date, startTime: when.time }),
      );
      await events.publishEvent(eventId);
      const { registrationId } = await registrations.register(
        { eventId, date: when.date },
        participant,
      );
      const occurrenceId = await firstOccurrenceId(owner, eventId);
      await owner
        .updateTable('event_occurrence')
        .set({
          status: 'completed',
          completed_at: new Date(),
          starts_at: new Date(Date.now() - 3 * 3_600_000),
        })
        .where('id', '=', occurrenceId)
        .execute();
      await owner
        .updateTable('registration')
        .set({ attendance: 'no_show' })
        .where('id', '=', registrationId)
        .execute();
      const { disputeId } = await attendance.openDispute(
        registrationId,
        participant,
        'I was there',
      );
      await attendance.resolveDispute(disputeId, moderator, true);
      expect(await auditActions(disputeId)).toEqual(['dispute.resolved']);
    });

    it('records other actions and lists them newest first with filters', async () => {
      const admin = await user('auditadmin');
      const first = await audit.record(admin, {
        action: 'reference.created',
        targetTable: 'sport',
        details: { code: 'padel' },
      });
      const second = await audit.record(admin, {
        action: 'user.role_changed',
        targetTable: 'user_account',
        targetId: admin,
        details: { role: 'moderator' },
      });
      const page = await audit.list({ actorId: admin }, { limit: 1 });
      expect(page.items.map((e) => e.id)).toEqual([second.id]);
      const next = await audit.list(
        { actorId: admin },
        { cursor: page.nextCursor ?? undefined, limit: 1 },
      );
      expect(next.items.map((e) => e.id)).toEqual([first.id]);
      expect(
        (await audit.list({ action: 'reference.created', actorId: admin }))
          .items,
      ).toHaveLength(1);
      expect(
        await codeOf(() =>
          audit.record(admin, {
            action: 'other',
            details: [] as unknown as Record<string, unknown>,
          }),
        ),
      ).toBe('INVALID_INPUT');
    });
  });
});

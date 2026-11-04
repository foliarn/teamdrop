import { AttendanceRepository } from '../repositories/attendance.repository';
import { AuthRepository } from '../repositories/auth.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
} from './helpers/event-helpers';
import type { OccurrenceKey } from '../types/event.types';

const HOUR_MS = 3_600_000;

/** An instant `hours` from now (negative: in the past). The database clock is the same machine's clock. */
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * HOUR_MS);
}

describe('Attendance (batch 1D)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const attendance = new AttendanceRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  /** Shorthand for a new adult user. */
  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /**
   * A one-off event published now, starting `hours` from now. Publication materializes the occurrence (BR-EVT-03).
   * Returns the occurrence key and the occurrence id.
   */
  async function startingIn(
    organizer: string,
    hours: number,
    overrides: Partial<Parameters<typeof eventInput>[1]> = {},
  ): Promise<{ key: OccurrenceKey; occurrenceId: string }> {
    const when = localIn(hours);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        ...overrides,
        startDate: when.date,
        startTime: when.time,
      }),
    );
    await events.publishEvent(eventId);
    return {
      key: { eventId, date: when.date },
      occurrenceId: await firstOccurrenceId(owner, eventId),
    };
  }

  /** Moves the effective start of an occurrence (owner connection, simulates the clock). */
  async function setStart(occurrenceId: string, startsAt: Date): Promise<void> {
    await owner
      .updateTable('event_occurrence')
      .set({ starts_at: startsAt })
      .where('id', '=', occurrenceId)
      .execute();
  }

  async function occurrenceStatus(occurrenceId: string): Promise<string> {
    const row = await owner
      .selectFrom('event_occurrence')
      .select('status')
      .where('id', '=', occurrenceId)
      .executeTakeFirstOrThrow();
    return row.status;
  }

  async function registrationRow(registrationId: string) {
    return owner
      .selectFrom('registration')
      .select(['status', 'attendance', 'attendance_set_by_id'])
      .where('id', '=', registrationId)
      .executeTakeFirstOrThrow();
  }

  async function disputeRow(disputeId: string) {
    return owner
      .selectFrom('attendance_dispute')
      .select(['status', 'resolved_by_id', 'resolved_at'])
      .where('id', '=', disputeId)
      .executeTakeFirstOrThrow();
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    // Leave the test database empty for the pgTAP suite, which expects no rows.
    await truncateAll(owner);
    await Promise.all([db.destroy(), owner.destroy()]);
  });

  it('BR-EVT-26: the start job moves a started scheduled occurrence to ongoing and leaves a future one alone', async () => {
    const organizer = await user('startOrg');
    const started = await startingIn(organizer, 2);
    const future = await startingIn(organizer, 5);
    await setStart(started.occurrenceId, hoursFromNow(-0.02));

    const outcome = await attendance.startDueOccurrences();

    expect(outcome.startedOccurrenceIds).toContain(started.occurrenceId);
    expect(outcome.startedOccurrenceIds).not.toContain(future.occurrenceId);
    expect(await occurrenceStatus(started.occurrenceId)).toBe('ongoing');
    expect(await occurrenceStatus(future.occurrenceId)).toBe('scheduled');
  });

  it('BR-EVT-26: the completion job completes an ended occurrence and returns its participants', async () => {
    const organizer = await user('endOrg');
    const a = await user('endA');
    const b = await user('endB');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    await registrations.register(key, a);
    await registrations.register(key, b);
    // Start 3 hours ago: the 90-minute occurrence ended 1.5 hours ago.
    await setStart(occurrenceId, hoursFromNow(-3));

    const outcome = await attendance.completeDueOccurrences();

    const done = outcome.completed.find((c) => c.occurrenceId === occurrenceId);
    expect(done?.eventId).toBe(key.eventId);
    expect(done?.participantUserIds).toEqual([a, b]);
    expect(await occurrenceStatus(occurrenceId)).toBe('completed');
  });

  it('BR-ATT-01: completion marks confirmed registrants attended, keeps an explicit no-show, leaves the waitlist unchanged', async () => {
    const organizer = await user('completeOrg');
    const [a, b, c] = [
      await user('completeA'),
      await user('completeB'),
      await user('completeC'),
    ];
    // Capacity 2: a and b are confirmed, c is waitlisted.
    const { key, occurrenceId } = await startingIn(organizer, 2, {
      maxParticipants: 2,
    });
    const regA = (await registrations.register(key, a)).registrationId;
    const regB = (await registrations.register(key, b)).registrationId;
    const regC = (await registrations.register(key, c)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-0.5));
    await attendance.setAttendance(regA, 'no_show', organizer);

    const outcome = await attendance.completeOccurrence(key, organizer);

    expect(outcome.participantUserIds).toEqual([a, b]);
    expect((await registrationRow(regA)).attendance).toBe('no_show');
    expect((await registrationRow(regB)).attendance).toBe('attended');
    const waitlisted = await registrationRow(regC);
    expect(waitlisted.status).toBe('waitlisted');
    expect(waitlisted.attendance).toBeNull();

    const entries = await attendance.listAttendance(key);
    expect(entries.map((e) => [e.userId, e.attendance])).toEqual([
      [a, 'no_show'],
      [b, 'attended'],
    ]);
  });

  it('BR-REG-05: completion erases the guest names of the occurrence and keeps the guest rows', async () => {
    const organizer = await user('guestOrg');
    const a = await user('guestA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (
      await registrations.register(key, a, { guestNames: ['Ann', 'Ben'] })
    ).registrationId;
    await setStart(occurrenceId, hoursFromNow(-3));

    await attendance.completeDueOccurrences();

    const guests = await owner
      .selectFrom('registration_guest')
      .select('display_name')
      .where('registration_id', '=', regA)
      .execute();
    expect(guests).toHaveLength(2);
    expect(guests.every((guest) => guest.display_name === null)).toBe(true);
  });

  it('BR-ATT-01: an organizer declares a no-show inside the attendance window', async () => {
    const organizer = await user('windowOrg');
    const a = await user('windowA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    // Started one hour ago: the window closes one hour after the end (30 minutes from now).
    await setStart(occurrenceId, hoursFromNow(-1));

    await attendance.setAttendance(regA, 'no_show', organizer);

    const row = await registrationRow(regA);
    expect(row.attendance).toBe('no_show');
    expect(row.attendance_set_by_id).toBe(organizer);
  });

  it('BR-ATT-01: after the end plus one hour, setting attendance is refused (ATTENDANCE_WINDOW_CLOSED)', async () => {
    const organizer = await user('closedOrg');
    const a = await user('closedA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    // The 90-minute occurrence ended 1.5 hours ago: the window closed 30 minutes ago.
    await setStart(occurrenceId, hoursFromNow(-3));

    expect(
      await codeOf(() => attendance.setAttendance(regA, 'no_show', organizer)),
    ).toBe('ATTENDANCE_WINDOW_CLOSED');
    expect((await registrationRow(regA)).attendance).toBeNull();
  });

  it('BR-ATT-01: attendance cannot be set on a waitlisted registration (INVALID_STATE)', async () => {
    const organizer = await user('waitOrg');
    const a = await user('waitA');
    const b = await user('waitB');
    // Capacity 1: a is confirmed, b is waitlisted.
    const { key, occurrenceId } = await startingIn(organizer, 2, {
      maxParticipants: 1,
    });
    await registrations.register(key, a);
    const regB = (await registrations.register(key, b)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-0.5));

    expect(
      await codeOf(() => attendance.setAttendance(regB, 'attended', organizer)),
    ).toBe('INVALID_STATE');
  });

  it('BR-EVT-26: early completion is refused before the start (INVALID_STATE) and allowed once started', async () => {
    const organizer = await user('earlyOrg');
    const { key, occurrenceId } = await startingIn(organizer, 2);

    expect(
      await codeOf(() => attendance.completeOccurrence(key, organizer)),
    ).toBe('INVALID_STATE');
    expect(await occurrenceStatus(occurrenceId)).toBe('scheduled');

    await setStart(occurrenceId, hoursFromNow(-1));
    const outcome = await attendance.completeOccurrence(key, organizer);

    expect(outcome.participantUserIds).toEqual([]);
    expect(await occurrenceStatus(occurrenceId)).toBe('completed');
  });

  it('BR-ATT-02: a participant cannot dispute an attendance that is not a no-show (INVALID_STATE)', async () => {
    const organizer = await user('disputeAttOrg');
    const a = await user('disputeAttA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-1));
    await attendance.setAttendance(regA, 'attended', organizer);

    expect(
      await codeOf(() => attendance.openDispute(regA, a, 'I was there')),
    ).toBe('INVALID_STATE');
  });

  it('BR-ATT-02: a dispute opened more than seven days after the end is refused (DISPUTE_WINDOW_CLOSED)', async () => {
    const organizer = await user('lateOrg');
    const a = await user('lateA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    // Ended more than seven days ago. The no-show is recorded directly, the window for declaring it is long closed.
    await setStart(occurrenceId, hoursFromNow(-8 * 24));
    await owner
      .updateTable('registration')
      .set({
        attendance: 'no_show',
        attendance_set_by_id: organizer,
        attendance_set_at: new Date(),
      })
      .where('id', '=', regA)
      .execute();

    expect(
      await codeOf(() => attendance.openDispute(regA, a, 'Too late')),
    ).toBe('DISPUTE_WINDOW_CLOSED');
  });

  it('BR-ATT-02: a second dispute of the same registration is refused (DISPUTE_ALREADY_EXISTS)', async () => {
    const organizer = await user('dupOrg');
    const a = await user('dupA');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-1));
    await attendance.setAttendance(regA, 'no_show', organizer);
    await attendance.openDispute(regA, a, 'First try');

    expect(
      await codeOf(() => attendance.openDispute(regA, a, 'Second try')),
    ).toBe('DISPUTE_ALREADY_EXISTS');
  });

  it("BR-ATT-02: a participant cannot dispute someone else's registration (NOT_FOUND)", async () => {
    const organizer = await user('otherOrg');
    const a = await user('otherA');
    const b = await user('otherB');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    await registrations.register(key, b);
    await setStart(occurrenceId, hoursFromNow(-1));
    await attendance.setAttendance(regA, 'no_show', organizer);

    expect(
      await codeOf(() => attendance.openDispute(regA, b, 'Not mine')),
    ).toBe('NOT_FOUND');
  });

  it('BR-ATT-02: an upheld dispute sets the attendance to attended, whatever the window', async () => {
    const organizer = await user('upholdOrg');
    const a = await user('upholdA');
    const moderator = await user('upholdMod');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-1));
    await attendance.setAttendance(regA, 'no_show', organizer);
    const { disputeId } = await attendance.openDispute(regA, a, 'I was there');

    const open = await attendance.listOpenDisputes({ limit: 100 });
    const listed = open.items.find((item) => item.disputeId === disputeId);
    expect(listed?.user?.id).toBe(a);
    expect(listed?.occurrence.eventId).toBe(key.eventId);

    // The window is now closed for good: the moderator's decision does not depend on it.
    await setStart(occurrenceId, hoursFromNow(-30 * 24));
    const outcome = await attendance.resolveDispute(disputeId, moderator, true);

    expect(outcome.userId).toBe(a);
    const row = await registrationRow(regA);
    expect(row.attendance).toBe('attended');
    expect(row.attendance_set_by_id).toBe(moderator);
    const dispute = await disputeRow(disputeId);
    expect(dispute.status).toBe('upheld');
    expect(dispute.resolved_by_id).toBe(moderator);
    expect(dispute.resolved_at).not.toBeNull();
  });

  it('BR-ATT-02: a rejected dispute keeps the no-show, cannot be resolved twice, and leaves the open list', async () => {
    const organizer = await user('rejectOrg');
    const a = await user('rejectA');
    const moderator = await user('rejectMod');
    const { key, occurrenceId } = await startingIn(organizer, 2);
    const regA = (await registrations.register(key, a)).registrationId;
    await setStart(occurrenceId, hoursFromNow(-1));
    await attendance.setAttendance(regA, 'no_show', organizer);
    const { disputeId } = await attendance.openDispute(
      regA,
      a,
      'Not convinced',
    );

    const outcome = await attendance.resolveDispute(
      disputeId,
      moderator,
      false,
    );

    expect(outcome.userId).toBe(a);
    expect((await registrationRow(regA)).attendance).toBe('no_show');
    expect((await disputeRow(disputeId)).status).toBe('rejected');
    expect(
      await codeOf(() => attendance.resolveDispute(disputeId, moderator, true)),
    ).toBe('INVALID_STATE');
    const open = await attendance.listOpenDisputes({ limit: 100 });
    expect(open.items.map((item) => item.disputeId)).not.toContain(disputeId);
  });

  it('concurrency: two parallel completion runs complete each due occurrence exactly once', async () => {
    const organizer = await user('raceOrg');
    const due: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { occurrenceId } = await startingIn(organizer, 2);
      await setStart(occurrenceId, hoursFromNow(-3));
      due.push(occurrenceId);
    }

    const [first, second] = await Promise.all([
      attendance.completeDueOccurrences(),
      attendance.completeDueOccurrences(),
    ]);

    const completedIds = [...first.completed, ...second.completed].map(
      (c) => c.occurrenceId,
    );
    expect(new Set(completedIds).size).toBe(completedIds.length);
    for (const occurrenceId of due) {
      expect(completedIds.filter((id) => id === occurrenceId)).toHaveLength(1);
      expect(await occurrenceStatus(occurrenceId)).toBe('completed');
    }
  });
});

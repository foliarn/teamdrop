import { sql } from 'kysely';
import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  daysFromToday,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
  registrationStatus,
} from './helpers/event-helpers';
import { addDays } from '../internal/time';

describe('Registrations (batch 1C)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const blocks = new BlockRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  /** Shorthand for a new adult user. */
  const user = (name: string, birthDate?: string): Promise<string> =>
    newUser(auth, refs, name, counter, birthDate);

  /** A one-off event published now, starting `hours` from now (materialized at publication, BR-EVT-03). */
  async function soonEvent(
    organizer: string,
    hours: number,
    overrides: Partial<Parameters<typeof eventInput>[1]> = {},
  ): Promise<{ eventId: string; date: string }> {
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
    return { eventId, date: when.date };
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

  it('BR-REG-04: a cancellation promotes the oldest waitlisted registration', async () => {
    const organizer = await user('promoOrg');
    const [a, b, c, d] = [
      await user('promoA'),
      await user('promoB'),
      await user('promoC'),
      await user('promoD'),
    ];
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 2,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    expect((await registrations.register(key, a)).status).toBe('confirmed');
    expect((await registrations.register(key, b)).status).toBe('confirmed');
    expect((await registrations.register(key, c)).status).toBe('waitlisted');
    expect((await registrations.register(key, d)).status).toBe('waitlisted');

    const outcome = await registrations.cancelRegistration(key, a);
    expect(outcome.promotedUserIds).toEqual([c]);
    const queue = await registrations.listWaitlist(key);
    expect(queue.map((entry) => entry.userId)).toEqual([d]);
  });

  it('BR-REG-04: strict first come, first served: a head that does not fit blocks the queue, and a newcomer does not jump it', async () => {
    const organizer = await user('fifoOrg');
    const [a, b, c, d, e] = [
      await user('fifoA'),
      await user('fifoB'),
      await user('fifoC'),
      await user('fifoD'),
      await user('fifoE'),
    ];
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 3,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    await registrations.register(key, a);
    await registrations.register(key, b);
    // C brings two guests and needs three spots: the free spot is not enough.
    expect(
      (
        await registrations.register(key, c, {
          guestNames: ['Guest one', 'Guest two'],
        })
      ).status,
    ).toBe('waitlisted');
    // D needs one spot, which is free, but the waitlist is not empty.
    expect((await registrations.register(key, d)).status).toBe('waitlisted');
    expect((await registrations.register(key, e)).status).toBe('waitlisted');

    const outcome = await registrations.cancelRegistration(key, a);
    expect(outcome.promotedUserIds).toEqual([]);
    expect(
      (await registrations.listWaitlist(key)).map((entry) => entry.userId),
    ).toEqual([c, d, e]);
  });

  it('BR-REG-03: in approval mode a registration is pending; approving it when full is refused (OCCURRENCE_FULL)', async () => {
    const organizer = await user('approvalOrg');
    const first = await user('approvalA');
    const second = await user('approvalB');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 1,
        registrationMode: 'approval',
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    const firstOutcome = await registrations.register(key, first);
    const secondOutcome = await registrations.register(key, second);
    expect(firstOutcome.status).toBe('pending_approval');
    expect(secondOutcome.status).toBe('pending_approval');

    await registrations.approveRegistration(firstOutcome.registrationId);
    expect(await registrationStatus(owner, firstOutcome.registrationId)).toBe(
      'confirmed',
    );
    expect(
      await codeOf(() =>
        registrations.approveRegistration(secondOutcome.registrationId),
      ),
    ).toBe('OCCURRENCE_FULL');
    expect(await registrationStatus(owner, secondOutcome.registrationId)).toBe(
      'pending_approval',
    );
  });

  it('BR-REG-06: a late cancellation (less than 24 hours before the start) is flagged', async () => {
    const organizer = await user('lateOrg');
    const player = await user('latePlayer');
    const { eventId, date } = await soonEvent(organizer, 2, {
      maxParticipants: 5,
    });
    const key = { eventId, date };
    const registered = await registrations.register(key, player);
    expect(registered.status).toBe('confirmed');

    const outcome = await registrations.cancelRegistration(key, player);
    expect(outcome.wasLate).toBe(true);
    const row = await owner
      .selectFrom('registration')
      .select('is_late_cancellation')
      .where('id', '=', registered.registrationId)
      .executeTakeFirstOrThrow();
    expect(row.is_late_cancellation).toBe(true);
  });

  it('BR-REG-06: a cancellation within 24 hours after a significant change is not late (BR-EVT-07)', async () => {
    const organizer = await user('exemptOrg');
    const player = await user('exemptPlayer');
    const { eventId, date } = await soonEvent(organizer, 2, {
      maxParticipants: 5,
    });
    const key = { eventId, date };
    await registrations.register(key, player);

    // A significant change (duration) just now starts the 24-hour window.
    const change = await events.updateEvent(
      eventId,
      organizer,
      { durationMinutes: 100 },
      'series',
    );
    expect(change.significantChange).toBe(true);

    const outcome = await registrations.cancelRegistration(key, player);
    expect(outcome.wasLate).toBe(false);
  });

  it('BR-SOC-03: blocking returns the upcoming occurrences both users are registered for', async () => {
    const organizer = await user('sharedOrg');
    const a = await user('sharedA');
    const b = await user('sharedB');
    const startDate = daysFromToday(5);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
    );
    await events.publishEvent(eventId);
    await registrations.register({ eventId, date: startDate }, a);
    await registrations.register({ eventId, date: startDate }, b);

    const occurrenceId = await firstOccurrenceId(owner, eventId);
    const outcome = await blocks.block(a, b);
    expect(outcome.sharedUpcomingOccurrenceIds).toEqual([occurrenceId]);
  });

  it('BR-REG-05: the participant list hides guest names from participants, and shows them to organizers', async () => {
    const organizer = await user('guestOrg');
    const guestBringer = await user('guestBringer');
    const other = await user('guestOther');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 6,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    await registrations.register(key, guestBringer, {
      guestNames: ['Sami', 'Yanis'],
    });
    await registrations.register(key, other);

    const asOrganizer = await registrations.listParticipants(organizer, key);
    const bringer = asOrganizer?.find((p) => p.userId === guestBringer);
    expect(bringer?.guestCount).toBe(2);
    expect(bringer?.guestNames).toEqual(['Sami', 'Yanis']);

    const asParticipant = await registrations.listParticipants(other, key);
    expect(
      asParticipant?.find((p) => p.userId === guestBringer)?.guestNames,
    ).toBeNull();
  });

  it('BR-REG-02: a second active registration is refused (ALREADY_REGISTERED)', async () => {
    const organizer = await user('dupOrg');
    const player = await user('dupPlayer');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    await registrations.register(key, player);
    expect(await codeOf(() => registrations.register(key, player))).toBe(
      'ALREADY_REGISTERED',
    );
  });

  it('BR-EVT-11: an adults-only event refuses a minor (ADULTS_ONLY) and accepts an adult', async () => {
    const organizer = await user('adultOrg');
    const minor = await user('adultMinor', '2010-06-01');
    const adult = await user('adultGrown');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        adultsOnly: true,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    expect(await codeOf(() => registrations.register(key, minor))).toBe(
      'ADULTS_ONLY',
    );
    expect((await registrations.register(key, adult)).status).toBe('confirmed');
  });

  it('BR-EVT-03: a draft is not visible to other users (NOT_VISIBLE), and a date the schedule does not produce is not found', async () => {
    const organizer = await user('openOrg');
    const player = await user('openPlayer');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, { startDate }),
    );
    expect(
      await codeOf(() =>
        registrations.register({ eventId, date: startDate }, player),
      ),
    ).toBe('NOT_VISIBLE');
    await events.publishEvent(eventId);
    expect(
      await codeOf(() =>
        registrations.register(
          { eventId, date: addDays(startDate, 999) },
          player,
        ),
      ),
    ).toBe('NOT_FOUND');
  });

  it('BR-EVT-03: a search with free spots only keeps occurrences that have room', async () => {
    const organizer = await user('freeOrg');
    const viewer = await user('freeViewer');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        title: 'Full one',
        maxParticipants: 1,
        ownerCountsTowardCapacity: true,
      }),
    );
    await events.publishEvent(eventId);
    const open = await events.createEvent(
      organizer,
      eventInput(refs, { startDate, title: 'Open one', maxParticipants: 3 }),
    );
    await events.publishEvent(open.eventId);

    const mine = [eventId, open.eventId];
    const all = await events.searchOccurrences(viewer, {
      from: startDate,
      to: startDate,
    });
    expect(
      all.items
        .filter((item) => mine.includes(item.eventId))
        .map((item) => item.title)
        .sort(),
    ).toEqual(['Full one', 'Open one']);
    const free = await events.searchOccurrences(viewer, {
      from: startDate,
      to: startDate,
      hasFreeSpots: true,
    });
    expect(
      free.items
        .filter((item) => mine.includes(item.eventId))
        .map((item) => item.title),
    ).toEqual(['Open one']);
  });

  it('BR-REG-04: concurrency: one spot left and five parallel registrations give one confirmed and four waitlisted', async () => {
    const organizer = await user('raceOrg');
    const players = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => user(`raceP${i}`)),
    );
    const { eventId, date } = await soonEvent(organizer, 30, {
      maxParticipants: 2,
      ownerCountsTowardCapacity: true,
    });
    const key = { eventId, date };

    const results = await Promise.all(
      players.map((userId) => registrations.register(key, userId)),
    );
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([
      'confirmed',
      'waitlisted',
      'waitlisted',
      'waitlisted',
      'waitlisted',
    ]);
    const confirmed = await owner
      .selectFrom('registration')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('occurrence_id', '=', await firstOccurrenceId(owner, eventId))
      .where('status', '=', 'confirmed')
      .executeTakeFirstOrThrow();
    // The owner plays and holds one spot; exactly one player takes the last one.
    expect(Number(confirmed.count)).toBe(2);
  });

  it('BR-REG-04: concurrency: three parallel cancellations on a full occurrence never exceed capacity and promote in FIFO order', async () => {
    const organizer = await user('fifoRaceOrg');
    const confirmed = await Promise.all(
      [1, 2, 3].map((i) => user(`fifoRaceC${i}`)),
    );
    const waiting = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => user(`fifoRaceW${i}`)),
    );
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 3,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    for (const userId of confirmed) {
      expect((await registrations.register(key, userId)).status).toBe(
        'confirmed',
      );
    }
    for (const userId of waiting) {
      expect((await registrations.register(key, userId)).status).toBe(
        'waitlisted',
      );
    }

    const outcomes = await Promise.all(
      confirmed.map((userId) => registrations.cancelRegistration(key, userId)),
    );
    const promoted = outcomes.flatMap((outcome) => outcome.promotedUserIds);
    expect(promoted.sort()).toEqual(
      [waiting[0], waiting[1], waiting[2]].sort(),
    );

    const occurrenceId = await firstOccurrenceId(owner, eventId);
    const stillConfirmed = await owner
      .selectFrom('registration')
      .select('user_id')
      .where('occurrence_id', '=', occurrenceId)
      .where('status', '=', 'confirmed')
      .execute();
    expect(stillConfirmed).toHaveLength(3);
    const queue = await registrations.listWaitlist(key);
    expect(queue.map((entry) => entry.userId)).toEqual([
      waiting[3],
      waiting[4],
    ]);
  });

  it('BR-REG-04: removing a confirmed participant promotes the waitlist; guests that do not fit are refused (OCCURRENCE_FULL)', async () => {
    const organizer = await user('removeOrg');
    const [a, b, c] = [
      await user('removeA'),
      await user('removeB'),
      await user('removeC'),
    ];
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 2,
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    const registeredA = await registrations.register(key, a);
    const registeredB = await registrations.register(key, b);
    await registrations.register(key, c);

    const removed = await registrations.removeParticipant(
      registeredA.registrationId,
      organizer,
    );
    expect(removed.promotedUserIds).toEqual([c]);
    expect(await registrationStatus(owner, registeredA.registrationId)).toBe(
      'removed',
    );

    expect(
      await codeOf(() =>
        registrations.setGuests(registeredB.registrationId, ['Plus one']),
      ),
    ).toBe('OCCURRENCE_FULL');
    const cleared = await registrations.setGuests(
      registeredB.registrationId,
      [],
    );
    expect(cleared.promotedUserIds).toEqual([]);
  });

  it('BR-REG-03: a pending approval can be declined; the pending list shows the others, oldest first', async () => {
    const organizer = await user('declineOrg');
    const [a, b] = [await user('declineA'), await user('declineB')];
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate,
        maxParticipants: 4,
        registrationMode: 'approval',
        recurrence: { rule: 'FREQ=WEEKLY' },
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: startDate };
    const first = await registrations.register(key, a);
    const second = await registrations.register(key, b);

    await registrations.declineRegistration(second.registrationId);
    expect(await registrationStatus(owner, second.registrationId)).toBe(
      'declined',
    );
    expect(
      (await registrations.listPendingApprovals(key)).map(
        (entry) => entry.userId,
      ),
    ).toEqual([a]);
    expect(
      await codeOf(() =>
        registrations.declineRegistration(second.registrationId),
      ),
    ).toBe('INVALID_STATE');
    await registrations.approveRegistration(first.registrationId);
    expect(await registrationStatus(owner, first.registrationId)).toBe(
      'confirmed',
    );
  });

  it('BR-EVT-24: cancelling an event cancels its upcoming occurrences and returns their registrants', async () => {
    const organizer = await user('cancelOrg');
    const player = await user('cancelPlayer');
    const startDate = daysFromToday(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
    );
    await events.publishEvent(eventId);
    await registrations.register({ eventId, date: startDate }, player);
    expect(
      (await events.listMyUpcoming(player)).map((r) => r.occurrence.eventId),
    ).toContain(eventId);

    const outcome = await events.cancelEvent(eventId, organizer, 'Weather');
    expect(outcome.affectedUserIds).toEqual([player]);
    expect(
      (await events.listMyUpcoming(player)).map((r) => r.occurrence.eventId),
    ).not.toContain(eventId);
    const details = await events.getOccurrence(organizer, {
      eventId,
      date: startDate,
    });
    expect(details?.status).toBe('cancelled');
    const latecomer = await user('cancelLate');
    expect(
      await codeOf(() =>
        registrations.register({ eventId, date: startDate }, latecomer),
      ),
    ).toBe('NOT_VISIBLE');
  });

  it('listMyPast: a played registration appears in the history of its player', async () => {
    const organizer = await user('historyOrg');
    const player = await user('historyPlayer');
    const { eventId, date } = await soonEvent(organizer, 30, {
      maxParticipants: 5,
    });
    await registrations.register({ eventId, date }, player);
    // Move the occurrence into the past, as if it had been played.
    await owner
      .updateTable('event_occurrence')
      .set({
        original_starts_at: sql<Date>`now() - interval '2 days'`,
        starts_at: sql<Date>`now() - interval '2 days'`,
      })
      .where('event_id', '=', eventId)
      .execute();

    const history = await events.listMyUpcoming(player);
    expect(history).toEqual([]);
    const past = await events.listMyPast(player);
    expect(past.items.map((item) => item.occurrence.eventId)).toEqual([
      eventId,
    ]);
    expect(past.nextCursor).toBeNull();
  });
});

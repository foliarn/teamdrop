import { AuthRepository } from '../repositories/auth.repository';
import { BlockRepository } from '../repositories/block.repository';
import { CircleRepository } from '../repositories/circle.repository';
import { CommunityRepository } from '../repositories/community.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { VenueRepository } from '../repositories/venue.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  countOccurrences,
  daysFromToday,
  eventInput,
  newUser,
  nextWeekday,
  parisInstant,
} from './helpers/event-helpers';
import { addDays } from '../internal/time';
import { sql } from 'kysely';

describe('Events (batch 1C)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const venues = new VenueRepository(db);
  const blocks = new BlockRepository(db);
  const circles = new CircleRepository(db);
  const communities = new CommunityRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  /** Shorthand for a new user with the default adult birth date. */
  const user = (name: string, birthDate?: string): Promise<string> =>
    newUser(auth, refs, name, counter, birthDate);

  /** Adds `userId` to a circle as an invitee: the owner invites, the invitee accepts. */
  async function joinCircle(
    circleId: string,
    inviterId: string,
    userId: string,
  ): Promise<void> {
    const { invitationId } = await circles.invite(circleId, inviterId, userId);
    await circles.respondToInvitation(invitationId, userId, true);
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

  /** Whether a materialized occurrence exists on `date` at 19:00 for `eventId` (owner connection). */
  async function getOccurrenceRow(
    eventId: string,
    date: string,
  ): Promise<boolean> {
    const row = await owner
      .selectFrom('event_occurrence')
      .select('id')
      .where('event_id', '=', eventId)
      .where('original_starts_at', '=', parisInstant(date, '19:00'))
      .executeTakeFirst();
    return row !== undefined;
  }

  describe('occurrences and search', () => {
    it('BR-EVT-03: a weekly series shows virtual occurrences; registering materializes one row, a second registrant reuses it', async () => {
      const organizer = await user('weeklyOrg');
      const a = await user('weeklyA');
      const b = await user('weeklyB');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);

      const page = await events.searchOccurrences(a, {
        from: startDate,
        to: addDays(startDate, 13),
      });
      const mine = page.items.filter((item) => item.eventId === eventId);
      expect(mine.map((item) => item.key.date)).toEqual([
        startDate,
        addDays(startDate, 7),
      ]);
      expect(mine.every((item) => !item.isMaterialized)).toBe(true);
      expect(await countOccurrences(owner, eventId)).toBe(0);

      const first = await registrations.register(
        { eventId, date: startDate },
        a,
      );
      expect(first.status).toBe('confirmed');
      expect(await countOccurrences(owner, eventId)).toBe(1);

      await registrations.register({ eventId, date: startDate }, b);
      expect(await countOccurrences(owner, eventId)).toBe(1);
    });

    it('BR-EVT-04: an occurrence-scope edit overrides only that date', async () => {
      const organizer = await user('scopeOrg');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);

      await events.updateEvent(
        eventId,
        organizer,
        { durationMinutes: 45 },
        { occurrenceDate: startDate },
      );

      const edited = await events.getOccurrence(organizer, {
        eventId,
        date: startDate,
      });
      const untouched = await events.getOccurrence(organizer, {
        eventId,
        date: addDays(startDate, 7),
      });
      expect(edited?.durationMinutes).toBe(45);
      expect(edited?.isMaterialized).toBe(true);
      expect(untouched?.durationMinutes).toBe(90);
      expect(untouched?.isMaterialized).toBe(false);
    });

    it('BR-EVT-05: "this and following" ends the series, creates the linked event and moves the materialized occurrence with its registrations', async () => {
      const organizer = await user('splitOrg');
      const participant = await user('splitPlayer');
      const startDate = daysFromToday(10);
      const fromDate = addDays(startDate, 14);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);
      await registrations.register({ eventId, date: fromDate }, participant);

      await events.updateEvent(
        eventId,
        organizer,
        { title: 'Renamed series' },
        { fromDate },
      );

      const oldEvent = await owner
        .selectFrom('event')
        .select(['recurrence_until', 'recurrence_count'])
        .where('id', '=', eventId)
        .executeTakeFirstOrThrow();
      expect(oldEvent.recurrence_until).toBe(addDays(fromDate, -1));
      expect(oldEvent.recurrence_count).toBeNull();

      const newEvent = await owner
        .selectFrom('event')
        .select(['id', 'start_date', 'title'])
        .where('split_from_event_id', '=', eventId)
        .executeTakeFirstOrThrow();
      expect(newEvent.start_date).toBe(fromDate);
      expect(newEvent.title).toBe('Renamed series');

      const moved = await getOccurrenceRow(newEvent.id, fromDate);
      expect(moved).toBe(true);
      const old = await events.getOccurrence(organizer, {
        eventId,
        date: fromDate,
      });
      expect(old).toBeNull();
      const kept = await events.getOccurrence(participant, {
        eventId: newEvent.id,
        date: fromDate,
      });
      expect(kept?.viewerRegistration?.status).toBe('confirmed');
    });

    it('BR-EVT-06: a series start time change keeps a materialized occurrence (re-keyed) with its registrants', async () => {
      const organizer = await user('timeOrg');
      const participant = await user('timePlayer');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);
      await registrations.register({ eventId, date: startDate }, participant);

      const outcome = await events.updateEvent(
        eventId,
        organizer,
        { startTime: '20:00' },
        'series',
      );
      expect(outcome.affectedUserIds).toContain(participant);
      expect(outcome.significantChange).toBe(true);

      const details = await events.getOccurrence(participant, {
        eventId,
        date: startDate,
      });
      expect(details?.startsAt).toEqual(parisInstant(startDate, '20:00'));
      expect(details?.viewerRegistration?.status).toBe('confirmed');
      expect(await countOccurrences(owner, eventId)).toBe(1);
    });

    it('BR-EVT-06: changing BYDAY cancels a materialized occurrence whose date disappears, and returns its registrants', async () => {
      const organizer = await user('bydayOrg');
      const participant = await user('bydayPlayer');
      const monday = nextWeekday(daysFromToday(10), 1);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate: monday,
          recurrence: { rule: 'FREQ=WEEKLY;BYDAY=MO' },
        }),
      );
      await events.publishEvent(eventId);
      await registrations.register({ eventId, date: monday }, participant);

      const outcome = await events.updateEvent(
        eventId,
        organizer,
        { recurrence: { rule: 'FREQ=WEEKLY;BYDAY=TU' } },
        'series',
      );
      expect(outcome.affectedUserIds).toContain(participant);

      const cancelled = await events.getOccurrence(organizer, {
        eventId,
        date: monday,
      });
      expect(cancelled?.status).toBe('cancelled');
    });

    it('BR-EVT-06: lowering the capacity below the taken spots is refused and changes nothing', async () => {
      const organizer = await user('capOrg');
      const first = await user('capA');
      const second = await user('capB');
      const third = await user('capC');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          maxParticipants: 4,
          recurrence: { rule: 'FREQ=WEEKLY' },
        }),
      );
      await events.publishEvent(eventId);
      for (const userId of [first, second, third]) {
        await registrations.register({ eventId, date: startDate }, userId);
      }

      expect(
        await codeOf(() =>
          events.updateEvent(
            eventId,
            organizer,
            { maxParticipants: 2 },
            'series',
          ),
        ),
      ).toBe('CAPACITY_BELOW_CONFIRMED');
      const details = await events.getOccurrence(organizer, {
        eventId,
        date: startDate,
      });
      expect(details?.maxParticipants).toBe(4);
    });

    it('BR-EVT-09: a stranger sees the municipality center only; a registrant sees the exact point', async () => {
      const organizer = await user('hideOrg');
      const stranger = await user('hideStranger');
      const player = await user('hidePlayer');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          locationHidden: true,
          location: { lat: 48.8755, lng: 2.3125 },
        }),
      );
      await events.publishEvent(eventId);

      const hidden = await events.getOccurrence(stranger, {
        eventId,
        date: startDate,
      });
      expect(hidden?.locationIsApproximate).toBe(true);
      expect(hidden?.location.lat).toBeCloseTo(48.874, 6);
      expect(hidden?.location.lng).toBeCloseTo(2.31, 6);
      expect(hidden?.address).toBeNull();

      await registrations.register({ eventId, date: startDate }, player);
      const exact = await events.getOccurrence(player, {
        eventId,
        date: startDate,
      });
      expect(exact?.locationIsApproximate).toBe(false);
      expect(exact?.location.lat).toBeCloseTo(48.8755, 6);
      expect(exact?.location.lng).toBeCloseTo(2.3125, 6);
      expect(exact?.address).toBe('1 test street, Paris 8e');
    });

    it('BR-EVT-23: a circle_only event is invisible to non-members, visible to members', async () => {
      const organizer = await user('circleOrg');
      const member = await user('circleMember');
      const stranger = await user('circleStranger');
      const circle = await circles.createCircle(organizer, {
        name: 'Test circle',
      });
      await joinCircle(circle.id, organizer, member);
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          visibility: 'circle_only',
          circleIds: [circle.id],
        }),
      );
      await events.publishEvent(eventId);

      expect(
        await events.getOccurrence(member, { eventId, date: startDate }),
      ).not.toBeNull();
      expect(
        await events.getOccurrence(stranger, { eventId, date: startDate }),
      ).toBeNull();
      const search = await events.searchOccurrences(stranger, {
        from: startDate,
        to: startDate,
      });
      expect(search.items.filter((item) => item.eventId === eventId)).toEqual(
        [],
      );
    });

    it('BR-EVT-23: a circle_priority event is public to non-members only after its delay', async () => {
      const organizer = await user('prioOrg');
      const stranger = await user('prioStranger');
      const circle = await circles.createCircle(organizer, {
        name: 'Priority circle',
      });
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          visibility: 'circle_priority',
          circlePriorityHours: 24,
          circleIds: [circle.id],
        }),
      );
      await events.publishEvent(eventId);
      expect(
        await events.getOccurrence(stranger, { eventId, date: startDate }),
      ).toBeNull();

      // Simulate the passing of the delay: the publication happened two days ago.
      await owner
        .updateTable('event')
        .set({ published_at: sql<Date>`now() - interval '48 hours'` })
        .where('id', '=', eventId)
        .execute();
      expect(
        await events.getOccurrence(stranger, { eventId, date: startDate }),
      ).not.toBeNull();
    });

    it('BR-EVT-23: a community_only event is visible to community members only', async () => {
      const organizer = await user('commOrg');
      const member = await user('commMember');
      const stranger = await user('commStranger');
      const community = await communities.createCommunity(organizer, {
        name: 'Test community',
        joinPolicy: 'open',
      });
      await communities.join(community.id, member);
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          visibility: 'community_only',
          communityId: community.id,
        }),
      );
      await events.publishEvent(eventId);

      expect(
        await events.getOccurrence(member, { eventId, date: startDate }),
      ).not.toBeNull();
      expect(
        await events.getOccurrence(stranger, { eventId, date: startDate }),
      ).toBeNull();
    });

    it('BR-SOC-02: a blocked user does not see the event and cannot register (NOT_VISIBLE)', async () => {
      const organizer = await user('blockOrg');
      const blocked = await user('blockedUser');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);
      await blocks.block(organizer, blocked);

      expect(
        await events.getOccurrence(blocked, { eventId, date: startDate }),
      ).toBeNull();
      expect(
        await codeOf(() =>
          registrations.register({ eventId, date: startDate }, blocked),
        ),
      ).toBe('NOT_VISIBLE');
    });

    it('BR-EVT-08: an event that uses a venue copies its address, point and municipality', async () => {
      const organizer = await user('venueOrg');
      const venue = await venues.createVenue(organizer, {
        name: 'Gym test venue',
        address: '9 venue street, Paris 8e',
        municipalityId: refs.municipalities.paris8,
        location: { lat: 48.8741, lng: 2.3101 },
      });
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          venueId: venue.id,
          address: undefined,
          location: undefined,
        }),
      );
      await events.publishEvent(eventId);

      const details = await events.getOccurrence(organizer, {
        eventId,
        date: startDate,
      });
      expect(details?.address).toBe('9 venue street, Paris 8e');
      expect(details?.location.lat).toBeCloseTo(48.8741, 6);
    });

    it('BR-EVT-08: without a venue, the address and point are required (INVALID_INPUT)', async () => {
      const organizer = await user('noAddrOrg');
      expect(
        await codeOf(() =>
          events.createEvent(
            organizer,
            eventInput(refs, {
              startDate: daysFromToday(10),
              address: undefined,
            }),
          ),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-EVT-01: a level range with minimum above maximum is refused (INVALID_INPUT)', async () => {
      const organizer = await user('levelOrg');
      expect(
        await codeOf(() =>
          events.createEvent(
            organizer,
            eventInput(refs, {
              startDate: daysFromToday(10),
              skillLevelMinId: refs.skillLevels.expert,
              skillLevelMaxId: refs.skillLevels.beginner,
            }),
          ),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-EVT-23: targeting a circle the owner is not a member of is refused (NOT_MEMBER)', async () => {
      const organizer = await user('notMemberOrg');
      const other = await user('notMemberOther');
      const foreignCircle = await circles.createCircle(other, {
        name: 'Foreign circle',
      });
      expect(
        await codeOf(() =>
          events.createEvent(
            organizer,
            eventInput(refs, {
              startDate: daysFromToday(10),
              visibility: 'circle_only',
              circleIds: [foreignCircle.id],
            }),
          ),
        ),
      ).toBe('NOT_MEMBER');
    });

    it('BR-EVT-03: a search range of more than 31 days is refused (INVALID_INPUT)', async () => {
      const viewer = await user('rangeViewer');
      const from = daysFromToday(1);
      expect(
        await codeOf(() =>
          events.searchOccurrences(viewer, { from, to: addDays(from, 31) }),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-EVT-03: search keeps occurrences within the radius of the point only', async () => {
      const organizer = await user('nearOrg');
      const viewer = await user('nearViewer');
      const startDate = daysFromToday(10);
      const paris = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, title: 'Near Paris' }),
      );
      await events.publishEvent(paris.eventId);
      const lyon = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          title: 'Far Lyon',
          municipalityId: refs.municipalities.lyon,
          address: '2 test street, Lyon',
          location: { lat: 45.764, lng: 4.8357 },
        }),
      );
      await events.publishEvent(lyon.eventId);

      const page = await events.searchOccurrences(viewer, {
        from: startDate,
        to: startDate,
        near: { point: { lat: 48.874, lng: 2.31 }, radiusMeters: 5_000 },
      });
      const mine = page.items.filter((item) =>
        [paris.eventId, lyon.eventId].includes(item.eventId),
      );
      expect(mine.map((item) => item.title)).toEqual(['Near Paris']);
      expect(mine[0]?.distanceMeters).toBeLessThan(5_000);
    });

    it('BR-EVT-21: the owner counts toward capacity: with max 2, one more player is confirmed and the next is waitlisted', async () => {
      const organizer = await user('ownerPlaysOrg');
      const first = await user('ownerPlaysA');
      const second = await user('ownerPlaysB');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          maxParticipants: 2,
          ownerCountsTowardCapacity: true,
          recurrence: { rule: 'FREQ=WEEKLY' },
        }),
      );
      await events.publishEvent(eventId);

      expect(
        (await registrations.register({ eventId, date: startDate }, first))
          .status,
      ).toBe('confirmed');
      expect(
        (await registrations.register({ eventId, date: startDate }, second))
          .status,
      ).toBe('waitlisted');

      const participants = await registrations.listParticipants(organizer, {
        eventId,
        date: startDate,
      });
      expect(participants?.map((p) => p.userId)).toEqual([organizer, first]);
      expect(participants?.[0]?.isOrganizer).toBe(true);
    });

    it('BR-EVT-24: publishing a published event is refused (INVALID_STATE)', async () => {
      const organizer = await user('publishTwiceOrg');
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate: daysFromToday(10) }),
      );
      await events.publishEvent(eventId);
      expect(await codeOf(() => events.publishEvent(eventId))).toBe(
        'INVALID_STATE',
      );
    });

    it('BR-EVT-20: a transferred event has the new owner, and the old owner becomes a co-organizer', async () => {
      const organizer = await user('transferOrg');
      const successor = await user('transferSucc');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate }),
      );
      await events.addCoOrganizer(eventId, successor, true);
      await events.transferOwnership(eventId, successor);

      expect(await events.getOrganizerRole(eventId, successor)).toBe('owner');
      expect(await events.getOrganizerRole(eventId, organizer)).toBe(
        'co_organizer',
      );
      expect(
        await events.getOrganizerRole(eventId, await user('transferNobody')),
      ).toBeNull();
    });
  });

  describe('organizers, cancellation, venues and my lists', () => {
    it('BR-EVT-21: a co-organizer who counts takes a spot on upcoming occurrences; removing them cancels that spot', async () => {
      const organizer = await user('coOrg');
      const coOrganizer = await user('coOrgCo');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate,
          maxParticipants: 4,
          recurrence: { rule: 'FREQ=WEEKLY' },
        }),
      );
      await events.publishEvent(eventId);
      await events.addCoOrganizer(eventId, coOrganizer, true);

      const before = await events.getOccurrence(organizer, {
        eventId,
        date: startDate,
      });
      expect(before?.takenSpots).toBe(1);
      const withCo = await registrations.listParticipants(organizer, {
        eventId,
        date: startDate,
      });
      expect(withCo?.map((p) => p.userId)).toContain(coOrganizer);

      const removed = await events.removeCoOrganizer(eventId, coOrganizer);
      expect(removed.promotedUserIds).toEqual([]);
      expect(await events.getOrganizerRole(eventId, coOrganizer)).toBeNull();
      const after = await events.getOccurrence(organizer, {
        eventId,
        date: startDate,
      });
      expect(after?.takenSpots).toBe(0);
    });

    it('BR-SOC-02: a blocked user cannot become a co-organizer (BLOCKED)', async () => {
      const organizer = await user('blockCoOrg');
      const blocked = await user('blockCoUser');
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate: daysFromToday(10) }),
      );
      await blocks.block(organizer, blocked);
      expect(
        await codeOf(() => events.addCoOrganizer(eventId, blocked, false)),
      ).toBe('BLOCKED');
    });

    it('BR-EVT-03: cancelling one occurrence cancels only that date and returns its registrants', async () => {
      const organizer = await user('cancelOccOrg');
      const player = await user('cancelOccPlayer');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, recurrence: { rule: 'FREQ=WEEKLY' } }),
      );
      await events.publishEvent(eventId);
      await registrations.register({ eventId, date: startDate }, player);

      const outcome = await events.cancelOccurrence(
        { eventId, date: startDate },
        organizer,
        'Pitch closed',
      );
      expect(outcome.affectedUserIds).toEqual([player]);
      expect(
        (await events.getOccurrence(organizer, { eventId, date: startDate }))
          ?.status,
      ).toBe('cancelled');
      expect(
        (
          await events.getOccurrence(organizer, {
            eventId,
            date: addDays(startDate, 7),
          })
        )?.status,
      ).toBe('scheduled');
      expect(
        await codeOf(() =>
          events.cancelOccurrence({ eventId, date: startDate }, organizer),
        ),
      ).toBe('INVALID_STATE');
    });

    it('BR-EVT-08: venues are searched by viewer: a private venue is only seen by its creator', async () => {
      const creator = await user('venueCreator');
      const other = await user('venueOther');
      const publicVenue = await venues.createVenue(creator, {
        name: 'Public court',
        address: 'Public address',
        municipalityId: refs.municipalities.paris8,
        location: { lat: 48.874, lng: 2.31 },
      });
      const privateVenue = await venues.createVenue(creator, {
        name: 'Private court',
        address: 'Private address',
        municipalityId: refs.municipalities.paris8,
        location: { lat: 48.874, lng: 2.31 },
        isPrivate: true,
      });

      const asOther = await venues.searchVenues(other, {
        near: { point: { lat: 48.874, lng: 2.31 }, radiusMeters: 1000 },
      });
      expect(asOther.map((v) => v.id)).toContain(publicVenue.id);
      expect(asOther.map((v) => v.id)).not.toContain(privateVenue.id);
      const asCreator = await venues.searchVenues(creator, { query: 'court' });
      expect(asCreator.map((v) => v.id).sort()).toEqual(
        [privateVenue.id, publicVenue.id].sort(),
      );

      await venues.updateVenue(publicVenue.id, { name: 'Renamed court' });
      const renamed = await venues.searchVenues(other, { query: 'Renamed' });
      expect(renamed.map((v) => v.name)).toEqual(['Renamed court']);

      await venues.deleteVenue(publicVenue.id);
      expect(await codeOf(() => venues.deleteVenue(publicVenue.id))).toBe(
        'NOT_FOUND',
      );
    });

    it('BR-EVT-23: target circles are replaced and an owner-only check applies', async () => {
      const organizer = await user('targetOrg');
      const circle = await circles.createCircle(organizer, {
        name: 'Target circle',
      });
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, {
          startDate: daysFromToday(10),
          visibility: 'circle_only',
          circleIds: [circle.id],
        }),
      );
      expect(
        await codeOf(() => events.setTargetCircles(eventId, organizer, [])),
      ).toBe('INVALID_INPUT');
      await events.setTargetCircles(eventId, organizer, [circle.id]);
      const rows = await owner
        .selectFrom('event_circle')
        .select('circle_id')
        .where('event_id', '=', eventId)
        .execute();
      expect(rows.map((row) => row.circle_id)).toEqual([circle.id]);
    });

    it('BR-EVT-20: listMyOrganized shows drafts, then the next occurrence once published', async () => {
      const organizer = await user('listOrg');
      const startDate = daysFromToday(10);
      const { eventId } = await events.createEvent(
        organizer,
        eventInput(refs, { startDate, title: 'Listed draft' }),
      );
      // A draft is listed with its planned next date (the schedule is known before publication).
      expect(await events.listMyOrganized(organizer)).toEqual([
        expect.objectContaining({
          eventId,
          title: 'Listed draft',
          status: 'draft',
          role: 'owner',
        }),
      ]);
      await events.publishEvent(eventId);
      const published = await events.listMyOrganized(organizer);
      expect(published[0]?.next?.date).toBe(startDate);
    });
  });
});

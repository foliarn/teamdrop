import { AuthRepository } from '../repositories/auth.repository';
import { BadgeRepository } from '../repositories/badge.repository';
import { BlockRepository } from '../repositories/block.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { StatsRepository } from '../repositories/stats.repository';
import { UserRepository } from '../repositories/user.repository';
import { appDb, ownerDb, truncateAll } from './helpers/test-db';
import { type MinimalRefs, seedMinimal } from './helpers/seed-minimal';
import {
  codeOf,
  daysFromToday,
  eventInput,
  firstOccurrenceId,
  localIn,
  newUser,
  parisInstant,
} from './helpers/event-helpers';

describe('Statistics and badges (batch 4)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const badges = new BadgeRepository(db);
  const blocks = new BlockRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const stats = new StatsRepository(db);
  const users = new UserRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  type SessionOptions = {
    daysAgo: number;
    sport?: 'football' | 'tennis' | 'chess';
    durationMinutes?: number;
    ownerPlays?: boolean;
    noShows?: string[];
    excused?: string[];
    guests?: Record<string, string[]>;
    status?: 'completed' | 'cancelled' | 'scheduled';
  };

  /**
   * A past session `daysAgo` days before today at 10:00 Paris, organized by `organizer` with `participants` confirmed.
   * Everyone attended unless listed. The clock is simulated with the owner connection.
   */
  async function session(
    organizer: string,
    participants: string[],
    options: SessionOptions,
  ): Promise<string> {
    const when = localIn(48);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate: when.date,
        startTime: when.time,
        sportId: refs.sports[options.sport ?? 'football'],
        durationMinutes: options.durationMinutes ?? 90,
        maxParticipants: 30,
        ownerCountsTowardCapacity: options.ownerPlays ?? false,
      }),
    );
    await events.publishEvent(eventId);
    const key = { eventId, date: when.date };
    for (const participant of participants) {
      await registrations.register(key, participant, {
        guestNames: options.guests?.[participant] ?? [],
      });
    }
    const occurrenceId = await firstOccurrenceId(owner, eventId);
    await owner
      .updateTable('event_occurrence')
      .set({
        starts_at: parisInstant(daysFromToday(-options.daysAgo), '10:00'),
        status: options.status ?? 'completed',
      })
      .where('id', '=', occurrenceId)
      .execute();
    await owner
      .updateTable('registration')
      .set({ attendance: 'attended' })
      .where('occurrence_id', '=', occurrenceId)
      .where('status', '=', 'confirmed')
      .execute();
    for (const [list, value] of [
      [options.noShows ?? [], 'no_show'],
      [options.excused ?? [], 'excused'],
    ] as const) {
      for (const userId of list) {
        await owner
          .updateTable('registration')
          .set({ attendance: value })
          .where('occurrence_id', '=', occurrenceId)
          .where('user_id', '=', userId)
          .execute();
      }
    }
    return occurrenceId;
  }

  /** A late cancellation (BR-REG-06) on an occurrence that then took place `daysAgo` days ago. */
  async function lateCancellation(
    organizer: string,
    userId: string,
    daysAgo: number,
  ): Promise<void> {
    const when = localIn(10);
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, { startDate: when.date, startTime: when.time }),
    );
    await events.publishEvent(eventId);
    await registrations.register({ eventId, date: when.date }, userId);
    const outcome = await registrations.cancelRegistration(
      { eventId, date: when.date },
      userId,
    );
    expect(outcome.wasLate).toBe(true);
    await owner
      .updateTable('event_occurrence')
      .set({
        starts_at: parisInstant(daysFromToday(-daysAgo), '10:00'),
        status: 'completed',
      })
      .where('event_id', '=', eventId)
      .execute();
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('profile statistics', () => {
    it('BR-STA-01, BR-STA-02: sessions and planned hours count attended completed occurrences, own events included', async () => {
      const organizer = await user('sessorg');
      const a = await user('sessa');
      await session(organizer, [a], {
        daysAgo: 3,
        durationMinutes: 60,
        ownerPlays: true,
      });
      await session(organizer, [a], { daysAgo: 4, durationMinutes: 120 });
      await session(organizer, [a], { daysAgo: 5, noShows: [a] });
      await session(organizer, [a], { daysAgo: 6, excused: [a] });
      await session(organizer, [a], { daysAgo: 7, status: 'cancelled' });

      const mine = await stats.getProfileStats(a, a);
      expect(mine).toMatchObject({ sessions: 2, minutes: 180 });
      // The organizer played in their own event once.
      expect(
        (await stats.getProfileStats(organizer, organizer))?.sessions,
      ).toBe(1);
    });

    it('BR-STA-03: people met are distinct other attendees; guests and no-shows never count; erased users still count', async () => {
      const organizer = await user('metorg');
      const a = await user('meta');
      const b = await user('metb');
      const c = await user('metc');
      const gone = await user('metgone');
      await session(organizer, [a, b, gone], {
        daysAgo: 2,
        guests: { [b]: ['Guest One', 'Guest Two'] },
      });
      await session(organizer, [a, b, c], { daysAgo: 3, noShows: [c] });
      await owner.deleteFrom('user_account').where('id', '=', gone).execute();
      expect((await stats.getProfileStats(a, a))?.peopleMet).toBe(2);
    });

    it('BR-STA-04: main sport by sessions and by hours, specialist at 70% of the sessions', async () => {
      const organizer = await user('sportorg');
      const a = await user('sporta');
      for (let i = 0; i < 3; i += 1) {
        await session(organizer, [a], {
          daysAgo: 10 + i,
          sport: 'football',
          durationMinutes: 60,
        });
      }
      await session(organizer, [a], {
        daysAgo: 20,
        sport: 'chess',
        durationMinutes: 300,
      });
      const allRounder = await stats.getProfileStats(a, a);
      expect(allRounder?.mainSportBySessions?.code).toBe('football');
      expect(allRounder?.mainSportByHours?.code).toBe('chess');
      // 3 of 4 sessions = 75%: specialist.
      expect(allRounder?.profile).toBe('specialist');

      await session(organizer, [a], { daysAgo: 21, sport: 'tennis' });
      // 3 of 5 = 60%: all-rounder.
      expect((await stats.getProfileStats(a, a))?.profile).toBe('all_rounder');

      const newcomer = await user('sportnew');
      expect(await stats.getProfileStats(newcomer, newcomer)).toMatchObject({
        sessions: 0,
        mainSportBySessions: null,
        profile: null,
        currentStreakDays: 0,
        longestStreakDays: 0,
      });
    });

    it('BR-STA-05: current and longest streaks in days, Europe/Paris, no grace period', async () => {
      const organizer = await user('streakorg');
      const a = await user('streaka');
      for (const daysAgo of [1, 2, 3, 10, 11, 12, 13]) {
        await session(organizer, [a], { daysAgo });
      }
      // Two sessions on the same day count as one day.
      await session(organizer, [a], { daysAgo: 2 });
      expect(await stats.getProfileStats(a, a)).toMatchObject({
        currentStreakDays: 3,
        longestStreakDays: 4,
      });

      const b = await user('streakb');
      await session(organizer, [b], { daysAgo: 2 });
      // The last session was the day before yesterday: the streak is broken.
      expect(await stats.getProfileStats(b, b)).toMatchObject({
        currentStreakDays: 0,
        longestStreakDays: 1,
      });
    });

    it('BR-ACC-14, BR-SOC-02: stats follow the stats visibility and blocking', async () => {
      const a = await user('visa');
      const viewer = await user('visviewer');
      expect(await stats.getProfileStats(viewer, a)).not.toBeNull();
      await users.updateSettings(a, { statsVisibility: 'only_me' });
      expect(await stats.getProfileStats(viewer, a)).toBeNull();
      expect(await stats.getProfileStats(a, a)).not.toBeNull();
      const b = await user('visb');
      await blocks.block(b, viewer);
      expect(await stats.getProfileStats(viewer, b)).toBeNull();
    });
  });

  describe('reliability (BR-ATT-04)', () => {
    it('BR-ATT-04: hidden until 5 past occurrences', async () => {
      const organizer = await user('relorg');
      const a = await user('rela');
      for (let i = 0; i < 4; i += 1) {
        await session(organizer, [a], { daysAgo: 5 + i });
      }
      expect(await stats.getReliability(a, a)).toEqual({
        pastOccurrences: 4,
        hidden: true,
        allTime: null,
        last90Days: null,
      });
    });

    it('BR-ATT-04: attended / (attended + no_show + 0.5 × late cancellations); excused is neutral; last 90 days', async () => {
      const organizer = await user('rateorg');
      const a = await user('ratea');
      for (let i = 0; i < 4; i += 1) {
        await session(organizer, [a], { daysAgo: 5 + i });
      }
      await session(organizer, [a], { daysAgo: 9, noShows: [a] });
      await session(organizer, [a], { daysAgo: 10, excused: [a] });
      await lateCancellation(organizer, a, 11);
      await lateCancellation(organizer, a, 12);
      // Old no-show, outside the last 90 days.
      await session(organizer, [a], { daysAgo: 120, noShows: [a] });

      const reliability = await stats.getReliability(a, a);
      expect(reliability?.pastOccurrences).toBe(9);
      expect(reliability?.hidden).toBe(false);
      expect(reliability?.allTime).toMatchObject({
        attended: 4,
        noShows: 2,
        lateCancellations: 2,
      });
      expect(reliability?.allTime?.rate).toBeCloseTo(4 / 7);
      expect(reliability?.last90Days?.noShows).toBe(1);
      expect(reliability?.last90Days?.rate).toBeCloseTo(4 / 6);
    });

    it('BR-ACC-14: reliability follows the reliability visibility', async () => {
      const a = await user('relvisa');
      const viewer = await user('relvisviewer');
      await users.updateSettings(a, { reliabilityVisibility: 'only_me' });
      expect(await stats.getReliability(viewer, a)).toBeNull();
      expect(await stats.getReliability(a, a)).not.toBeNull();
    });
  });

  describe('badges (BR-GAM-01, BR-GAM-02)', () => {
    it('BR-GAM-02: progress data gathers stats, reliability, cheers and organized sessions', async () => {
      const organizer = await user('progressorg');
      const a = await user('progressa');
      await session(organizer, [a], { daysAgo: 1 });
      const progress = await stats.getBadgeProgress(organizer);
      expect(progress.organizedCompletedOccurrences).toBe(1);
      expect(progress.cheersReceived).toEqual({});
      expect((await stats.getBadgeProgress(a)).stats.sessions).toBe(1);
    });

    it('BR-GAM-01: the catalog has badges with optional tiers', async () => {
      const { id } = await badges.createBadge({
        code: 'regular',
        name: 'Regular',
        description: 'Attend sessions',
        category: 'sessions',
        sortOrder: 1,
      });
      await badges.setBadgeTiers(id, [
        { rank: 1, name: 'Bronze', threshold: 10 },
        { rank: 2, name: 'Silver', threshold: 50 },
      ]);
      const [badge] = (await badges.listBadges()).filter(
        (b) => b.code === 'regular',
      );
      expect(badge.tiers.map((t) => [t.rank, t.name, t.threshold])).toEqual([
        [1, 'Bronze', 10],
        [2, 'Silver', 50],
      ]);
      expect(
        await codeOf(() =>
          badges.createBadge({
            code: 'regular',
            name: 'Again',
            description: 'x',
            category: 'x',
            sortOrder: 2,
          }),
        ),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          badges.setBadgeTiers(id, [
            { rank: 1, name: 'A', threshold: 1 },
            { rank: 1, name: 'B', threshold: 2 },
          ]),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-GAM-02: badges are awarded, upgraded, seen once and can be lost', async () => {
      const a = await user('holder');
      const { id } = await badges.createBadge({
        code: 'streaker',
        name: 'Streaker',
        description: 'Keep a streak',
        category: 'streaks',
        sortOrder: 2,
      });
      await badges.setBadgeTiers(id, [
        { rank: 1, name: 'Bronze', threshold: 3 },
        { rank: 2, name: 'Silver', threshold: 7 },
      ]);
      const [bronze, silver] = (await badges.listBadges()).find(
        (b) => b.id === id,
      )!.tiers;

      expect(await badges.awardBadge(a, id, bronze.id)).toEqual({
        changed: true,
        isNew: true,
      });
      expect(await badges.awardBadge(a, id, bronze.id)).toEqual({
        changed: false,
        isNew: false,
      });
      expect((await badges.listUnseenBadges(a)).map((b) => b.badgeId)).toEqual([
        id,
      ]);
      await badges.markBadgesSeen(a, [id]);
      expect(await badges.listUnseenBadges(a)).toEqual([]);

      // A new level replays the animation.
      expect(await badges.awardBadge(a, id, silver.id)).toEqual({
        changed: true,
        isNew: false,
      });
      const unseen = await badges.listUnseenBadges(a);
      expect(unseen[0].tier).toMatchObject({ rank: 2, name: 'Silver' });

      // Removing a level keeps the badge without it.
      await badges.setBadgeTiers(id, [
        { rank: 1, name: 'Bronze', threshold: 3 },
      ]);
      expect((await badges.listUserBadges(a, a))?.[0].tier).toBeNull();

      expect(await badges.removeBadge(a, id)).toEqual({ removed: true });
      expect(await badges.removeBadge(a, id)).toEqual({ removed: false });
    });

    it('BR-GAM-01: a tier of another badge is refused', async () => {
      const a = await user('wrongtier');
      const one = await badges.createBadge({
        code: 'one',
        name: 'One',
        description: 'x',
        category: 'x',
        sortOrder: 3,
      });
      const two = await badges.createBadge({
        code: 'two',
        name: 'Two',
        description: 'x',
        category: 'x',
        sortOrder: 4,
      });
      await badges.setBadgeTiers(two.id, [
        { rank: 1, name: 'T', threshold: 1 },
      ]);
      const tier = (await badges.listBadges()).find((b) => b.id === two.id)!
        .tiers[0];
      expect(await codeOf(() => badges.awardBadge(a, one.id, tier.id))).toBe(
        'INVALID_REFERENCE',
      );
    });

    it('BR-ACC-14: badges follow the badges visibility; others never see seen_at', async () => {
      const a = await user('badgevis');
      const viewer = await user('badgeviewer');
      const { id } = await badges.createBadge({
        code: 'visible',
        name: 'Visible',
        description: 'x',
        category: 'x',
        sortOrder: 5,
      });
      await badges.awardBadge(a, id);
      await badges.markBadgesSeen(a, [id]);
      expect((await badges.listUserBadges(a, a))?.[0].seenAt).toBeInstanceOf(
        Date,
      );
      expect((await badges.listUserBadges(viewer, a))?.[0].seenAt).toBeNull();
      await users.updateSettings(a, { badgesVisibility: 'only_me' });
      expect(await badges.listUserBadges(viewer, a)).toBeNull();
      await badges.deleteBadge(id);
      expect(await badges.listUserBadges(a, a)).toEqual([]);
    });
  });
});

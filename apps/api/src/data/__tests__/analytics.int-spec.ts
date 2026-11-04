import { sql } from 'kysely';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { AuthRepository } from '../repositories/auth.repository';
import { EventRepository } from '../repositories/event.repository';
import { RegistrationRepository } from '../repositories/registration.repository';
import { UserRepository } from '../repositories/user.repository';
import { addDays, todayLocal } from '../internal/time';
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

describe('Analytics (batch 5)', () => {
  const db = appDb();
  const owner = ownerDb();
  const auth = new AuthRepository(db);
  const analytics = new AnalyticsRepository(db);
  const events = new EventRepository(db);
  const registrations = new RegistrationRepository(db);
  const users = new UserRepository(db);
  const counter = { value: 0 };
  let refs: MinimalRefs;

  const user = (name: string): Promise<string> =>
    newUser(auth, refs, name, counter);

  /** Runs every refresh function on the whole history (owner connection, as pg_cron would). */
  async function refreshAll(): Promise<void> {
    await sql`SELECT refresh_heatmap('2000-01-01'), refresh_sport_activity_daily('2000-01-01'),
                     refresh_user_city_activity('2000-01-01'), refresh_platform_daily_stat(current_date - 400)`.execute(
      owner,
    );
  }

  /** A completed session `daysAgo` days ago at `time` (Paris), everyone attended. Returns the event id. */
  async function session(
    organizer: string,
    participants: string[],
    options: {
      daysAgo: number;
      time?: string;
      sport?: 'football' | 'tennis' | 'chess';
      place?: 'paris8' | 'lyon';
      guests?: string[];
    },
  ): Promise<string> {
    const when = localIn(48);
    const lyon = options.place === 'lyon';
    const { eventId } = await events.createEvent(
      organizer,
      eventInput(refs, {
        startDate: when.date,
        startTime: when.time,
        sportId: refs.sports[options.sport ?? 'football'],
        maxParticipants: 30,
        municipalityId: lyon
          ? refs.municipalities.lyon
          : refs.municipalities.paris8,
        location: lyon
          ? { lat: 45.764, lng: 4.8357 }
          : { lat: 48.874, lng: 2.31 },
        durationMinutes: 60,
      }),
    );
    await events.publishEvent(eventId);
    for (const [index, participant] of participants.entries()) {
      await registrations.register({ eventId, date: when.date }, participant, {
        guestNames: index === 0 ? (options.guests ?? []) : [],
      });
    }
    const occurrenceId = await firstOccurrenceId(owner, eventId);
    await owner
      .updateTable('event_occurrence')
      .set({
        starts_at: parisInstant(
          daysFromToday(-options.daysAgo),
          options.time ?? '18:00',
        ),
        status: 'completed',
      })
      .where('id', '=', occurrenceId)
      .execute();
    await owner
      .updateTable('registration')
      .set({ attendance: 'attended' })
      .where('occurrence_id', '=', occurrenceId)
      .where('status', '=', 'confirmed')
      .execute();
    return eventId;
  }

  beforeAll(async () => {
    await truncateAll(owner);
    refs = await seedMinimal(owner);
  });

  afterAll(async () => {
    await db.destroy();
    await owner.destroy();
  });

  describe('heatmap (BR-STA-07)', () => {
    let a: string;
    let organizer: string;

    beforeAll(async () => {
      organizer = await user('heatorg');
      a = await user('heata');
      // Three football sessions at the same Paris spot, on Mondays-or-not at 18:00; one with two guests.
      await session(organizer, [a], { daysAgo: 3, guests: ['G1', 'G2'] });
      await session(organizer, [a], { daysAgo: 4 });
      await session(organizer, [a], { daysAgo: 5 });
      // Only two sessions in Lyon: never shown.
      await session(organizer, [a], { daysAgo: 3, place: 'lyon' });
      await session(organizer, [a], { daysAgo: 4, place: 'lyon' });
      await refreshAll();
    });

    it('BR-STA-07: a cell is shown with at least 3 occurrences, at resolutions 6, 8 and 9', async () => {
      for (const resolution of [6, 8, 9] as const) {
        const cells = await analytics.getHeatmap({ resolution });
        expect(cells).toHaveLength(1);
        // Participants: one attended registration per session, plus two guests (BR-REG-05).
        expect(cells[0]).toMatchObject({ occurrences: 3, participants: 5 });
        expect(cells[0].center.lat).toBeCloseTo(48.874, 0);
        expect(cells[0].center.lng).toBeCloseTo(2.31, 0);
      }
    });

    it('BR-STA-07: filters by sport, hour, weekday and bounds', async () => {
      expect(
        await analytics.getHeatmap({
          resolution: 8,
          sportId: refs.sports.tennis,
        }),
      ).toEqual([]);
      expect(
        await analytics.getHeatmap({ resolution: 8, hourFrom: 19 }),
      ).toEqual([]);
      expect(
        await analytics.getHeatmap({ resolution: 8, hourFrom: 18, hourTo: 18 }),
      ).toHaveLength(1);
      expect(
        await analytics.getHeatmap({
          resolution: 6,
          bounds: { south: 45, west: 4, north: 46, east: 5 },
        }),
      ).toEqual([]);
      expect(
        await codeOf(() => analytics.getHeatmap({ resolution: 7 as 6 })),
      ).toBe('INVALID_INPUT');
      expect(
        await codeOf(() =>
          analytics.getHeatmap({ resolution: 8, daysOfWeek: [8] }),
        ),
      ).toBe('INVALID_INPUT');
    });

    it('BR-GDP-06: anonymous aggregates of past months survive deletions', async () => {
      const org = await user('frozenorg');
      const p = await user('frozenp');
      const eventIds: string[] = [];
      for (const daysAgo of [100, 101, 102]) {
        eventIds.push(
          await session(org, [p], { daysAgo, place: 'lyon', sport: 'chess' }),
        );
      }
      await refreshAll();
      const before = await analytics.getHeatmap({
        resolution: 8,
        sportId: refs.sports.chess,
        fromMonth: '2000-01-01',
      });
      expect(before).toHaveLength(1);
      await owner.deleteFrom('event').where('id', 'in', eventIds).execute();
      // The nightly refresh only recomputes the recent window.
      await sql`SELECT refresh_analytics_nightly()`.execute(owner);
      expect(
        await analytics.getHeatmap({
          resolution: 8,
          sportId: refs.sports.chess,
          fromMonth: '2000-01-01',
        }),
      ).toEqual(before);
    });
  });

  describe('city rankings (BR-STA-06)', () => {
    it('BR-STA-06: refresh groups arrondissements under their city', async () => {
      const org = await user('rankorg');
      const p = await user('rankp');
      await session(org, [p], { daysAgo: 1 });
      await refreshAll();
      const rows = await owner
        .selectFrom('user_city_activity')
        .select(['municipality_id', 'sessions', 'minutes'])
        .where('user_id', '=', p)
        .execute();
      expect(rows).toEqual([
        {
          municipality_id: refs.municipalities.paris,
          sessions: 1,
          minutes: 60,
        },
      ]);
      // Under 100 active users, Paris is not shown.
      expect(
        await analytics.getCityRanking(
          p,
          refs.municipalities.paris8,
          'all_time',
          'sessions',
        ),
      ).toMatchObject({
        cityId: refs.municipalities.paris,
        shown: false,
        viewer: null,
      });
    });

    it('BR-STA-06, BR-ACC-15: shown from 100 active users, percentiles, users hiding from rankings left out', async () => {
      // 120 synthetic users active in Lyon this month, i sessions each (owner connection, fast).
      await sql`
        WITH u AS (
          INSERT INTO user_account (username, email_ciphertext, email_hash, first_name, birth_date_ciphertext, municipality_id)
          SELECT 'bulk' || g, '\\x01'::bytea, decode(md5('bulk' || g), 'hex'), 'Bulk', '\\x01'::bytea, ${refs.municipalities.lyon}::uuid
          FROM generate_series(1, 120) g
          RETURNING id, username
        ), s AS (
          INSERT INTO user_setting (user_id) SELECT id FROM u RETURNING user_id
        )
        INSERT INTO user_city_activity (user_id, municipality_id, month, sessions, minutes)
        SELECT u.id, ${refs.municipalities.lyon}::uuid, date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date,
               substring(u.username from 5)::int, 60 * substring(u.username from 5)::int
        FROM u
      `.execute(owner);
      const top = (
        await owner
          .selectFrom('user_account')
          .select('id')
          .where('username', '=', 'bulk120')
          .executeTakeFirstOrThrow()
      ).id;
      const ranking = await analytics.getCityRanking(
        top,
        refs.municipalities.lyon,
        'current_month',
        'sessions',
      );
      // 120 synthetic users, plus heata when its Lyon sessions of the heatmap block fall in the current month.
      expect(ranking.activeUsers).toBeGreaterThanOrEqual(120);
      expect(ranking).toMatchObject({
        shown: true,
        viewer: { value: 120, rank: 1, percentile: 100 },
      });

      await users.updateSettings(top, { hideFromRankings: true });
      const hidden = await analytics.getCityRanking(
        top,
        refs.municipalities.lyon,
        'current_month',
        'hours',
      );
      expect(hidden).toMatchObject({
        activeUsers: ranking.activeUsers - 1,
        viewer: null,
      });

      const mine = await analytics.listMyCityRankings(
        top,
        'all_time',
        'sessions',
      );
      expect(mine.map((r) => r.cityId)).toEqual([refs.municipalities.lyon]);
    });
  });

  describe('popular sports and trends (BR-STA-08)', () => {
    it('BR-STA-08: compares the rolling window with the previous one of the same length, per area', async () => {
      const today = todayLocal();
      await sql`
        INSERT INTO sport_activity_daily (municipality_id, sport_id, day, occurrence_count, participant_count) VALUES
          (${refs.municipalities.paris8}::uuid, ${refs.sports.tennis}::uuid, ${addDays(today, -5)}::date, 2, 8),
          (${refs.municipalities.paris8}::uuid, ${refs.sports.tennis}::uuid, ${addDays(today, -40)}::date, 1, 4),
          (${refs.municipalities.lyon}::uuid, ${refs.sports.tennis}::uuid, ${addDays(today, -5)}::date, 5, 50)
        ON CONFLICT DO NOTHING
      `.execute(owner);
      const paris = await analytics.getPopularSports(
        { municipalityId: refs.municipalities.paris },
        'month',
      );
      const tennis = paris.find((s) => s.sport.code === 'tennis');
      expect(tennis).toMatchObject({
        occurrences: 2,
        participants: 8,
        previousOccurrences: 1,
        previousParticipants: 4,
        participantChange: 1,
      });
      const trend = await analytics.getTrends(
        { municipalityId: refs.municipalities.paris },
        'month',
        refs.sports.tennis,
      );
      expect(trend.current).toMatchObject({ occurrences: 2, participants: 8 });
      expect(trend.previous).toMatchObject({ occurrences: 1, participants: 4 });
      expect(trend.series).toEqual([
        { day: addDays(today, -5), occurrences: 2, participants: 8 },
      ]);
      const france = await analytics.getPopularSports({}, 'year');
      expect(france.find((s) => s.sport.code === 'tennis')?.participants).toBe(
        62,
      );
    });
  });

  describe('back-office statistics (BR-STA-10)', () => {
    it('BR-STA-10: daily rows, users, no-show rate and reports', async () => {
      const newcomer = await user('dailynew');
      const yesterday = addDays(todayLocal(), -1);
      await owner
        .updateTable('user_account')
        .set({ created_at: parisInstant(yesterday, '12:00') })
        .where('id', '=', newcomer)
        .execute();
      await sql`SELECT refresh_platform_daily_stat(current_date - 10)`.execute(
        owner,
      );
      const stats = await analytics.getPlatformStats(
        addDays(todayLocal(), -10),
        yesterday,
      );
      expect(
        stats.days.find((d) => d.day === yesterday)?.signups,
      ).toBeGreaterThanOrEqual(1);
      expect(stats.totalUsers).toBeGreaterThan(100);
      expect(stats.noShowRate).toBe(0);
      expect(stats.topCities.map((c) => c.municipalityId)).toContain(
        refs.municipalities.paris,
      );
      expect(stats.reports.byStatus).toEqual({
        open: 0,
        assigned: 0,
        resolved: 0,
        dismissed: 0,
      });
      expect(
        await codeOf(() =>
          analytics.getPlatformStats('2026-02-01', '2026-01-01'),
        ),
      ).toBe('INVALID_INPUT');
    });
  });
});

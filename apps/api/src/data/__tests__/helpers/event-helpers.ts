import type { Kysely } from 'kysely';
import type { DB } from '../../internal/generated/database';
import {
  addDays,
  instantToLocal,
  localToInstant,
  todayLocal,
} from '../../internal/time';
import type { AuthRepository } from '../../repositories/auth.repository';
import { DataError } from '../../errors';
import type { LocalDate } from '../../types/common.types';
import type { CreateEventInput } from '../../types/event.types';
import type { MinimalRefs } from './seed-minimal';

/** Resolves with the DataError code thrown by `fn`, or fails when nothing (or another error) is thrown. */
export async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof DataError) {
      return err.code;
    }
    throw err;
  }
  throw new Error('Expected a DataError, but the call succeeded');
}

/** Creates an account with a unique username. `birthDate` decides adults-only tests. */
export async function newUser(
  auth: AuthRepository,
  refs: MinimalRefs,
  name: string,
  counter: { value: number },
  birthDate = '1990-01-01',
): Promise<string> {
  counter.value += 1;
  const username = `${name}${counter.value}`;
  return (
    await auth.createUserWithPassword({
      username,
      email: `${username}@events.test`,
      passwordHash: '$argon2id$placeholder',
      firstName: name,
      birthDate,
      municipalityId: refs.municipalities.paris8,
    })
  ).userId;
}

/** Local date and time of an instant `hours` from now, in Europe/Paris. */
export function localIn(hours: number): { date: LocalDate; time: string } {
  return instantToLocal(
    new Date(Date.now() + hours * 3_600_000),
    'Europe/Paris',
  );
}

/** The first date on or after `from` whose ISO weekday (1 = Monday) is `isoDay`. */
export function nextWeekday(from: LocalDate, isoDay: number): LocalDate {
  let date = from;
  for (;;) {
    const [y, m, d] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const iso = weekday === 0 ? 7 : weekday;
    if (iso === isoDay) {
      return date;
    }
    date = addDays(date, 1);
  }
}

/** Base input of an event: 90 minutes at 19:00, Paris 8e, football, from beginner to expert. */
export function eventInput(
  refs: MinimalRefs,
  overrides: Partial<CreateEventInput> & Pick<CreateEventInput, 'startDate'>,
): CreateEventInput {
  return {
    sportId: refs.sports.football,
    title: 'Test event',
    skillLevelMinId: refs.skillLevels.beginner,
    skillLevelMaxId: refs.skillLevels.expert,
    maxParticipants: 4,
    ownerCountsTowardCapacity: false,
    address: '1 test street, Paris 8e',
    municipalityId: refs.municipalities.paris8,
    location: { lat: 48.874, lng: 2.31 },
    startTime: '19:00',
    durationMinutes: 90,
    ...overrides,
  };
}

/** Local date of `days` after today in Paris, shorthand used by the tests. */
export function daysFromToday(days: number): LocalDate {
  return addDays(todayLocal(), days);
}

/** Instant of a local date and time in Paris. */
export function parisInstant(date: LocalDate, time: string): Date {
  return localToInstant(date, time, 'Europe/Paris');
}

/** Counts materialized occurrences of an event (owner connection, used to check materialization). */
export async function countOccurrences(
  owner: Kysely<DB>,
  eventId: string,
): Promise<number> {
  const row = await owner
    .selectFrom('event_occurrence')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('event_id', '=', eventId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** Id of the first materialized occurrence of an event (owner connection). */
export async function firstOccurrenceId(
  owner: Kysely<DB>,
  eventId: string,
): Promise<string> {
  const row = await owner
    .selectFrom('event_occurrence')
    .select('id')
    .where('event_id', '=', eventId)
    .orderBy('original_starts_at')
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Status of a registration row (owner connection). */
export async function registrationStatus(
  owner: Kysely<DB>,
  registrationId: string,
): Promise<string> {
  const row = await owner
    .selectFrom('registration')
    .select('status')
    .where('id', '=', registrationId)
    .executeTakeFirstOrThrow();
  return row.status;
}

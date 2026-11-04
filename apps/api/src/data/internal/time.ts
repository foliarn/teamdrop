import type { LocalDate } from '../types/common.types';

/** Calendar logic runs in this time zone (BR-TECH-05). */
export const CALENDAR_TIME_ZONE = 'Europe/Paris';

/** Today's date in Europe/Paris, as 'YYYY-MM-DD'. */
export function parisToday(now: Date = new Date()): LocalDate {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Full years between two 'YYYY-MM-DD' dates (birth date and reference date). */
export function completedYears(
  birthDate: LocalDate,
  onDate: LocalDate,
): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = onDate.split('-').map(Number);
  let years = y - by;
  if (m < bm || (m === bm && d < bd)) {
    years -= 1;
  }
  return years;
}

/** True when a person born on `birthDate` has completed at least `minimumAge` years on `onDate`. */
export function isAtLeastAge(
  birthDate: LocalDate,
  minimumAge: number,
  onDate: LocalDate,
): boolean {
  return completedYears(birthDate, onDate) >= minimumAge;
}

/** Throws-free check of the 'YYYY-MM-DD' format. */
export function isLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Throws-free check of the 'HH:mm' format (00:00 to 23:59). */
export function isLocalTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Wall-clock fields of an instant in a time zone. */
type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formatter that reads the wall clock of an instant in `timeZone` (cached per zone). */
function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallClockFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    wallClockFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock fields of `instant` as seen in `timeZone`. */
function wallClockOf(instant: Date, timeZone: string): WallClock {
  const values: Record<string, number> = {};
  for (const part of wallClockFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

/** Offset in milliseconds between the wall clock of `timeZone` and UTC, at `instant`. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  const w = wallClockOf(new Date(whole), timeZone);
  const wallAsUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second,
  );
  return wallAsUtc - whole;
}

/**
 * Converts a local date and time in `timeZone` to the instant it denotes (BR-TECH-05).
 * Uses the zone offset in force at that wall-clock time, so a 6 pm session stays at 6 pm across daylight saving.
 * Example: 2026-03-28 18:00 Europe/Paris is 17:00Z; 2026-03-29 18:00 is 16:00Z.
 */
export function localToInstant(
  date: LocalDate,
  time: string,
  timeZone: string = CALENDAR_TIME_ZONE,
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes: the first offset may belong to the other side of a daylight saving switch.
  const firstGuess = wall - zoneOffsetMs(wall, timeZone);
  return new Date(wall - zoneOffsetMs(firstGuess, timeZone));
}

/** Local date and time (`YYYY-MM-DD`, `HH:mm`) of an instant in `timeZone`. */
export function instantToLocal(
  instant: Date,
  timeZone: string = CALENDAR_TIME_ZONE,
): { date: LocalDate; time: string } {
  const w = wallClockOf(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return {
    date: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** Today's local date in `timeZone` (defaults to Europe/Paris). */
export function todayLocal(
  timeZone: string = CALENDAR_TIME_ZONE,
  now: Date = new Date(),
): LocalDate {
  return instantToLocal(now, timeZone).date;
}

/**
 * Adds `days` calendar days to a local date. Calendar arithmetic only: no time zone is involved.
 * Example: addDays('2026-02-27', 2) is '2026-03-01'.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

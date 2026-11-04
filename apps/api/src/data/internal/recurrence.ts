import { RRule, type Options, type Weekday } from 'rrule';
import { InvalidInputError, InvalidRecurrenceError } from '../errors';
import type { LocalDate } from '../types/common.types';

/** Input of `expandDates`: the schedule of one event. */
export type RecurrenceInput = {
  /** First local date of the series (BR-EVT-02). */
  startDate: LocalDate;
  /** RFC 5545 RRULE (supported subset), or null for a one-off event. */
  rule: string | null;
  /** Last local date of the series, inclusive. Exclusive with `count`. */
  until: LocalDate | null;
  /** Number of occurrences, counted from `startDate`. Exclusive with `until`. */
  count: number | null;
};

/** Parsed form of the supported RRULE subset. */
type ParsedRule = {
  freq: 'DAILY' | 'WEEKLY';
  interval: number;
  byday: string[] | null;
};

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const KEYS_ALLOWED = new Set(['FREQ', 'INTERVAL', 'BYDAY']);

/** Weekday objects of rrule, by RRULE code. */
const WEEKDAYS: Record<string, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

/**
 * Parses an RRULE string of the supported subset (BR-EVT-02):
 * FREQ=DAILY|WEEKLY, optional INTERVAL=1..52, optional BYDAY (WEEKLY only, values MO..SU).
 * COUNT, UNTIL and DTSTART are rejected: end conditions live in `recurrence_until` / `recurrence_count`.
 * Throws `InvalidRecurrenceError` for anything else.
 */
function parseRule(rule: string): ParsedRule {
  if (rule.length === 0) {
    throw new InvalidRecurrenceError('Empty recurrence rule');
  }
  const values = new Map<string, string>();
  for (const part of rule.split(';')) {
    const match = /^([A-Z]+)=([^=]+)$/.exec(part);
    if (match === null) {
      throw new InvalidRecurrenceError(`Malformed recurrence part: ${part}`);
    }
    const [, key, value] = match;
    if (!KEYS_ALLOWED.has(key)) {
      throw new InvalidRecurrenceError(`Unsupported recurrence key: ${key}`);
    }
    if (values.has(key)) {
      throw new InvalidRecurrenceError(`Duplicate recurrence key: ${key}`);
    }
    values.set(key, value);
  }

  const freq = values.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY') {
    throw new InvalidRecurrenceError('FREQ must be DAILY or WEEKLY');
  }

  let interval = 1;
  const intervalValue = values.get('INTERVAL');
  if (intervalValue !== undefined) {
    if (!/^\d+$/.test(intervalValue)) {
      throw new InvalidRecurrenceError('INTERVAL must be an integer');
    }
    interval = Number(intervalValue);
    if (interval < 1 || interval > 52) {
      throw new InvalidRecurrenceError('INTERVAL must be between 1 and 52');
    }
  }

  let byday: string[] | null = null;
  const bydayValue = values.get('BYDAY');
  if (bydayValue !== undefined) {
    if (freq !== 'WEEKLY') {
      throw new InvalidRecurrenceError('BYDAY is only supported with WEEKLY');
    }
    byday = bydayValue.split(',');
    const unique = new Set(byday);
    if (
      unique.size !== byday.length ||
      byday.some((code) => !(WEEKDAY_CODES as readonly string[]).includes(code))
    ) {
      throw new InvalidRecurrenceError('BYDAY must list distinct MO..SU codes');
    }
  }

  return { freq, interval, byday };
}

/**
 * Throws `InvalidRecurrenceError` when `rule` is outside the supported subset (BR-EVT-02).
 * Example of an accepted rule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`.
 */
export function validateRecurrenceRule(rule: string): void {
  parseRule(rule);
}

/** Floating date: midnight UTC of a local date, so that no time zone or DST shift can move it. */
function floatingDate(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Local date of a floating date built by `floatingDate`. */
function localDateOf(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

/**
 * Local dates of a schedule that fall in `[from, to]`, both inclusive (BR-EVT-03).
 * - No rule: the single date `startDate`, when it is in range.
 * - With a rule: the dates generated from `startDate`, so `count` counts from `startDate`, not from `from`.
 * Dates are floating: DST never moves them. Throws `InvalidRecurrenceError` for an unsupported rule
 * and `InvalidInputError` when `until` and `count` are both given.
 */
export function expandDates(
  input: RecurrenceInput,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  if (from > to) {
    return [];
  }
  if (input.rule === null) {
    return input.startDate >= from && input.startDate <= to
      ? [input.startDate]
      : [];
  }
  if (input.until !== null && input.count !== null) {
    throw new InvalidInputError(
      'Recurrence end: until and count are exclusive',
    );
  }

  const parsed = parseRule(input.rule);
  const options: Partial<Options> = {
    freq: parsed.freq === 'DAILY' ? RRule.DAILY : RRule.WEEKLY,
    interval: parsed.interval,
    dtstart: floatingDate(input.startDate),
  };
  if (parsed.byday !== null) {
    options.byweekday = parsed.byday.map((code) => WEEKDAYS[code]);
  }
  if (input.until !== null) {
    options.until = floatingDate(input.until);
  }
  if (input.count !== null) {
    options.count = input.count;
  }

  return new RRule(options)
    .between(floatingDate(from), floatingDate(to), true)
    .map(localDateOf);
}

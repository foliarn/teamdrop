import { DataError, InvalidRecurrenceError } from '../errors';
import { expandDates, validateRecurrenceRule } from './recurrence';

const base = { until: null, count: null };

describe('recurrence (BR-EVT-02, BR-EVT-03)', () => {
  it('BR-EVT-02: weekly on MO and TH over two weeks', () => {
    // 2026-11-02 is a Monday.
    const dates = expandDates(
      { startDate: '2026-11-02', rule: 'FREQ=WEEKLY;BYDAY=MO,TH', ...base },
      '2026-11-02',
      '2026-11-15',
    );
    expect(dates).toEqual([
      '2026-11-02',
      '2026-11-05',
      '2026-11-09',
      '2026-11-12',
    ]);
  });

  it('BR-EVT-02: every 2 weeks keeps the phase of the start date', () => {
    const dates = expandDates(
      { startDate: '2026-11-02', rule: 'FREQ=WEEKLY;INTERVAL=2', ...base },
      '2026-11-01',
      '2026-12-07',
    );
    expect(dates).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('BR-EVT-02: a count is counted from the start date, not from the range start', () => {
    const dates = expandDates(
      { startDate: '2026-11-01', rule: 'FREQ=DAILY', until: null, count: 3 },
      '2026-11-02',
      '2026-11-30',
    );
    expect(dates).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('BR-EVT-02: an until date is inclusive', () => {
    const dates = expandDates(
      {
        startDate: '2026-11-02',
        rule: 'FREQ=DAILY',
        until: '2026-11-04',
        count: null,
      },
      '2026-11-01',
      '2026-11-30',
    );
    expect(dates).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('BR-EVT-03: a one-off event has only its start date, in range or not', () => {
    const input = { startDate: '2026-11-10', rule: null, ...base };
    expect(expandDates(input, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-10',
    ]);
    expect(expandDates(input, '2026-11-11', '2026-11-30')).toEqual([]);
  });

  it('BR-EVT-03: dates do not shift across the daylight saving switch', () => {
    const dates = expandDates(
      { startDate: '2026-03-25', rule: 'FREQ=WEEKLY;BYDAY=WE', ...base },
      '2026-03-25',
      '2026-04-08',
    );
    expect(dates).toEqual(['2026-03-25', '2026-04-01', '2026-04-08']);
  });

  it('BR-EVT-02: accepts the supported subset', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=DAILY;INTERVAL=52',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=SU',
      'FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR,SA,SU',
    ]) {
      expect(() => validateRecurrenceRule(rule)).not.toThrow();
    }
  });

  it.each([
    ['COUNT is an end condition of the event', 'FREQ=DAILY;COUNT=3'],
    ['UNTIL is an end condition of the event', 'FREQ=DAILY;UNTIL=20261231'],
    ['DTSTART is set by the event', 'FREQ=DAILY;DTSTART=20261101'],
    ['monthly frequency is not supported', 'FREQ=MONTHLY'],
    ['BYDAY needs WEEKLY', 'FREQ=DAILY;BYDAY=MO'],
    ['INTERVAL must be at least 1', 'FREQ=WEEKLY;INTERVAL=0'],
    ['INTERVAL must be at most 52', 'FREQ=WEEKLY;INTERVAL=53'],
    ['unknown weekday code', 'FREQ=WEEKLY;BYDAY=XX'],
    ['duplicate weekday', 'FREQ=WEEKLY;BYDAY=MO,MO'],
    ['missing FREQ', 'INTERVAL=2'],
    ['duplicate key', 'FREQ=DAILY;FREQ=WEEKLY'],
    ['malformed part', 'FREQ=DAILY;;'],
    ['empty rule', ''],
  ])('BR-EVT-02: rejects an invalid rule (%s)', (_reason, rule) => {
    expect(() => validateRecurrenceRule(rule)).toThrow(InvalidRecurrenceError);
    try {
      expandDates(
        { startDate: '2026-11-02', rule, ...base },
        '2026-11-01',
        '2026-11-30',
      );
      throw new Error('expected a failure');
    } catch (err) {
      expect(err).toBeInstanceOf(DataError);
      expect((err as DataError).code).toBe('INVALID_RECURRENCE');
    }
  });
});

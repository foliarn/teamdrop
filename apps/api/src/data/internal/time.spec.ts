import { addDays, instantToLocal, localToInstant, todayLocal } from './time';

describe('time (BR-TECH-05)', () => {
  it('BR-TECH-05: 18:00 Paris keeps its wall clock across the March switch (CET before, CEST after)', () => {
    expect(
      localToInstant('2026-03-28', '18:00', 'Europe/Paris').toISOString(),
    ).toBe('2026-03-28T17:00:00.000Z');
    expect(
      localToInstant('2026-03-29', '18:00', 'Europe/Paris').toISOString(),
    ).toBe('2026-03-29T16:00:00.000Z');
  });

  it('BR-TECH-05: 18:00 Paris keeps its wall clock across the October switch', () => {
    expect(
      localToInstant('2026-10-25', '18:00', 'Europe/Paris').toISOString(),
    ).toBe('2026-10-25T17:00:00.000Z');
    expect(
      localToInstant('2026-10-24', '18:00', 'Europe/Paris').toISOString(),
    ).toBe('2026-10-24T16:00:00.000Z');
  });

  it('BR-TECH-05: defaults to Europe/Paris', () => {
    expect(localToInstant('2026-10-24', '18:00').toISOString()).toBe(
      '2026-10-24T16:00:00.000Z',
    );
  });

  it('BR-TECH-05: local to instant to local is a round trip', () => {
    for (const [date, time] of [
      ['2026-03-28', '18:00'],
      ['2026-03-29', '00:30'],
      ['2026-10-25', '02:30'],
      ['2026-12-31', '23:59'],
    ] as const) {
      const instant = localToInstant(date, time, 'Europe/Paris');
      expect(instantToLocal(instant, 'Europe/Paris')).toEqual({ date, time });
    }
  });

  it('BR-TECH-05: converts an instant to the local date and time of another zone', () => {
    expect(
      instantToLocal(new Date('2026-06-01T23:30:00.000Z'), 'Europe/Paris'),
    ).toEqual({ date: '2026-06-02', time: '01:30' });
  });

  it('todayLocal returns the date of the given instant in the zone', () => {
    expect(
      todayLocal('Europe/Paris', new Date('2026-06-01T23:30:00.000Z')),
    ).toBe('2026-06-02');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

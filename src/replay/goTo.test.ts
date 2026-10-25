import { describe, expect, it } from 'vitest';
import { nextLocalTime } from './goTo';

const utc = (s: string) => Date.parse(`${s}Z`) / 1000;

describe('nextLocalTime', () => {
  it('finds the next London open in winter and summer time', () => {
    expect(nextLocalTime(utc('2026-01-14T10:00:00'), 'Europe/London', 8)).toBe(utc('2026-01-15T08:00:00'));
    expect(nextLocalTime(utc('2026-06-15T05:00:00'), 'Europe/London', 8)).toBe(utc('2026-06-15T07:00:00'));
  });

  it('skips weekends and handles zones ahead of UTC', () => {
    // Friday evening in New York -> Monday 08:00 EST.
    expect(nextLocalTime(utc('2026-01-16T22:00:00'), 'America/New_York', 8)).toBe(utc('2026-01-19T13:00:00'));
    // Tokyo 09:00 is 00:00 UTC.
    expect(nextLocalTime(utc('2026-01-14T01:00:00'), 'Asia/Tokyo', 9)).toBe(utc('2026-01-15T00:00:00'));
  });
});

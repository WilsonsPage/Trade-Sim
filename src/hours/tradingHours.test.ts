import { describe, expect, it } from 'vitest';
import type { Bar } from '../types';
import { timeToEdge, tradingHourSpans, ukWindow, ukWindows } from './tradingHours';

const utc = (s: string) => Date.parse(`${s}Z`) / 1000;
const bar = (time: number): Bar => ({ time, open: 1, high: 1, low: 1, close: 1 });
const hourly = (from: string, hours: number) => Array.from({ length: hours }, (_, i) => bar(utc(from) + i * 3600));

describe('ukWindow', () => {
  it('is 08:00–20:00 UTC in winter (GMT)', () => {
    expect(ukWindow(utc('2026-01-15T00:00'))).toEqual([utc('2026-01-15T08:00'), utc('2026-01-15T20:00')]);
  });

  it('is 07:00–19:00 UTC in summer (BST)', () => {
    expect(ukWindow(utc('2026-07-15T00:00'))).toEqual([utc('2026-07-15T07:00'), utc('2026-07-15T19:00')]);
  });

  it('follows the clock change days', () => {
    // Clocks go forward on 29 March 2026 and back on 25 October 2026.
    expect(ukWindow(utc('2026-03-29T00:00'))[0]).toBe(utc('2026-03-29T07:00'));
    expect(ukWindow(utc('2026-10-25T00:00'))[0]).toBe(utc('2026-10-25T08:00'));
  });
});

describe('ukWindows', () => {
  it('lists each day overlapping the range', () => {
    expect(ukWindows(utc('2026-01-15T12:00'), utc('2026-01-16T09:00'))).toEqual([
      [utc('2026-01-15T08:00'), utc('2026-01-15T20:00')],
      [utc('2026-01-16T08:00'), utc('2026-01-16T20:00')],
    ]);
  });
});

describe('timeToEdge', () => {
  const bars = hourly('2026-01-15T00:00', 3);

  it('maps a bar open time to its left edge', () => {
    expect(timeToEdge(bars, 3600, utc('2026-01-15T01:00'))).toBe(0.5);
    expect(timeToEdge(bars, 3600, utc('2026-01-15T01:30'))).toBe(1);
  });

  it('snaps times in a gap to the end of the bar before', () => {
    const gappy = [bar(utc('2026-01-15T00:00')), bar(utc('2026-01-15T05:00'))];
    expect(timeToEdge(gappy, 3600, utc('2026-01-15T03:00'))).toBe(0.5);
  });

  it('runs past the last bar', () => {
    expect(timeToEdge(bars, 3600, utc('2026-01-15T05:00'))).toBe(4.5);
    expect(timeToEdge(bars, 3600, utc('2026-01-15T05:00'), 2)).toBe(4.5);
  });
});

describe('tradingHourSpans', () => {
  it('covers the bars from 08:00 to 20:00 UK time', () => {
    const bars = hourly('2026-01-15T00:00', 48);
    expect(tradingHourSpans(bars, 3600)).toEqual([
      [7.5, 19.5],
      [31.5, 43.5],
    ]);
  });

  it('shows the whole of a window that has started, even past the last bar', () => {
    const bars = hourly('2026-01-15T00:00', 48);
    expect(tradingHourSpans(bars, 3600, 10)).toEqual([[7.5, 19.5]]);
    expect(tradingHourSpans(bars, 3600, 7)).toEqual([]);
  });

  it('shades part of a bar on higher timeframes', () => {
    const bars = [bar(utc('2026-01-15T00:00')), bar(utc('2026-01-16T00:00'))];
    expect(tradingHourSpans(bars, 86400)).toEqual([
      [-0.5 + 8 / 24, -0.5 + 20 / 24],
      [0.5 + 8 / 24, 0.5 + 20 / 24],
    ]);
  });
});

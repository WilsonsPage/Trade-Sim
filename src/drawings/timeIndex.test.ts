import { describe, expect, it } from 'vitest';
import { logicalToTime, timeToLogical } from './timeIndex';

const bars = [0, 60, 120, 600].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 }));

describe('time <-> logical index', () => {
  it('maps bar times to their index', () => {
    expect(timeToLogical(bars, 60, 120)).toBe(2);
    expect(logicalToTime(bars, 60, 2)).toBe(120);
  });

  it('interpolates across gaps such as weekends', () => {
    expect(timeToLogical(bars, 60, 360)).toBe(2.5);
    expect(logicalToTime(bars, 60, 2.5)).toBe(360);
  });

  it('extrapolates past the last bar', () => {
    expect(timeToLogical(bars, 60, 720)).toBe(5);
    expect(logicalToTime(bars, 60, 5)).toBe(720);
  });
});

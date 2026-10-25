import { describe, expect, it } from 'vitest';
import { lastIndexAtOrBefore } from './useReplay';

const bars = [100, 160, 220, 400].map((time) => ({ time, open: 1, high: 1, low: 1, close: 1 }));

describe('lastIndexAtOrBefore', () => {
  it('finds the bar open at a time, even across gaps', () => {
    expect(lastIndexAtOrBefore(bars, 160)).toBe(1);
    expect(lastIndexAtOrBefore(bars, 300)).toBe(2);
    expect(lastIndexAtOrBefore(bars, 999)).toBe(3);
  });

  it('returns -1 before the first bar', () => {
    expect(lastIndexAtOrBefore(bars, 99)).toBe(-1);
  });
});

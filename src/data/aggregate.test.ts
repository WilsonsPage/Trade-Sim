import { describe, expect, it } from 'vitest';
import { aggregate, bucketOf, indexAtTime, partialBar } from './aggregate';
import { parseCsv } from './load';
import type { Bar } from '../types';

const m1 = (i: number, close: number): Bar => ({ time: 3600 + i * 60, open: close - 1, high: close + 1, low: close - 2, close });

describe('aggregate', () => {
  const base = Array.from({ length: 12 }, (_, i) => m1(i, 100 + i));
  const agg = aggregate(base, 300);

  it('groups M1 bars into UTC-aligned M5 bars', () => {
    expect(agg.bars).toHaveLength(3);
    expect(agg.bars[0]).toEqual({ time: 3600, open: 99, high: 105, low: 98, close: 104 });
    expect(agg.startIdx).toEqual([0, 5, 10]);
    expect(agg.endIdx).toEqual([4, 9, 11]);
  });

  it('finds the bucket for a raw bar and builds a forming bar', () => {
    expect(bucketOf(agg, 0)).toBe(0);
    expect(bucketOf(agg, 6)).toBe(1);
    expect(partialBar(base, agg, 1, 6)).toEqual({ time: 3900, open: 104, high: 107, low: 103, close: 106 });
  });

  it('finds the first bar at or after a time', () => {
    expect(indexAtTime(base, 3600 + 7 * 60)).toBe(7);
    expect(indexAtTime(base, 0)).toBe(0);
  });
});

describe('parseCsv', () => {
  it('reads an MT5 export', () => {
    const text = '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\n2024.01.02\t00:00:00\t1.1\t1.2\t1.0\t1.15\t5\n2024.01.02\t00:01:00\t1.15\t1.3\t1.1\t1.2\t3';
    const d = parseCsv(text, 'EURUSD');
    expect(d.baseSeconds).toBe(60);
    expect(d.bars[0]).toEqual({ time: Date.UTC(2024, 0, 2) / 1000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 });
  });

  it('reads a plain CSV with unix times', () => {
    const d = parseCsv('time,open,high,low,close\n3600,1,2,0,1.5\n7200,1.5,2,1,1.8', 'X');
    expect(d.baseSeconds).toBe(3600);
    expect(d.bars).toHaveLength(2);
  });
});

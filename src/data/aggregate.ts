import type { Bar } from '../types';

export interface Aggregated {
  bars: Bar[];
  /** Index of the first base bar in each aggregated bar. */
  startIdx: number[];
  /** Index of the last base bar in each aggregated bar. */
  endIdx: number[];
}

/** Groups base bars into UTC-aligned buckets of `seconds`. */
export function aggregate(base: Bar[], seconds: number): Aggregated {
  const bars: Bar[] = [];
  const startIdx: number[] = [];
  const endIdx: number[] = [];
  let bucket = -1;
  for (let i = 0; i < base.length; i++) {
    const b = base[i];
    const t = b.time - (b.time % seconds);
    if (t !== bucket) {
      bucket = t;
      bars.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      startIdx.push(i);
      endIdx.push(i);
    } else {
      const cur = bars[bars.length - 1];
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      endIdx[endIdx.length - 1] = i;
    }
  }
  return { bars, startIdx, endIdx };
}

/** Index of the aggregated bar that contains base bar `pos`. */
export function bucketOf(agg: Aggregated, pos: number): number {
  let lo = 0;
  let hi = agg.endIdx.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (agg.endIdx[mid] < pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The aggregated bar `k` built only from base bars up to `pos` (it may still be forming). */
export function partialBar(base: Bar[], agg: Aggregated, k: number, pos: number): Bar {
  const start = agg.startIdx[k];
  const end = Math.min(pos, agg.endIdx[k]);
  const first = base[start];
  const bar: Bar = { time: agg.bars[k].time, open: first.open, high: first.high, low: first.low, close: first.close };
  for (let i = start + 1; i <= end; i++) {
    const b = base[i];
    if (b.high > bar.high) bar.high = b.high;
    if (b.low < bar.low) bar.low = b.low;
    bar.close = b.close;
  }
  return bar;
}

/** First base index with time >= `time`, or the last index if none. */
export function indexAtTime(base: Bar[], time: number): number {
  let lo = 0;
  let hi = base.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (base[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

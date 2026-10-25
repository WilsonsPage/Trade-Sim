import type { Bar } from '../types';

// Drawings store real times so they survive timeframe changes. The chart positions
// things by bar index ("logical"), so these convert between the two, extrapolating
// past the last bar so drawings can extend into the future.

export function timeToLogical(bars: Bar[], tfSeconds: number, time: number): number {
  const n = bars.length;
  if (!n) return 0;
  if (time >= bars[n - 1].time) return n - 1 + (time - bars[n - 1].time) / tfSeconds;
  if (time <= bars[0].time) return (time - bars[0].time) / tfSeconds;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - bars[lo].time) / (bars[hi].time - bars[lo].time);
}

export function logicalToTime(bars: Bar[], tfSeconds: number, logical: number): number {
  const n = bars.length;
  if (!n) return 0;
  if (logical >= n - 1) return bars[n - 1].time + (logical - (n - 1)) * tfSeconds;
  if (logical <= 0) return bars[0].time + logical * tfSeconds;
  const i = Math.floor(logical);
  return Math.round(bars[i].time + (logical - i) * (bars[i + 1].time - bars[i].time));
}

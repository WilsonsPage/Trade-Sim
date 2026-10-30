import type { Bar } from '../types';

// The trading hours shading marks 08:00–20:00 UK time each day. UK time moves
// between GMT and BST, so each day's window is worked out in Europe/London.

export const UK_OPEN_HOUR = 8;
export const UK_CLOSE_HOUR = 20;

const DAY = 86400;

const londonHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' });

/** Hours London is ahead of UTC at a moment (0 in winter, 1 in summer). */
function londonOffsetHours(utcSeconds: number): number {
  const h = Number(londonHour.format(new Date(utcSeconds * 1000)));
  return (h - new Date(utcSeconds * 1000).getUTCHours() + 24) % 24;
}

/** UTC start and end (seconds) of 08:00–20:00 UK time on the UTC day starting at `dayStart`. */
export function ukWindow(dayStart: number): [number, number] {
  // UK clocks change at 01:00 UTC, so midday tells the offset for the whole window.
  const offset = londonOffsetHours(dayStart + DAY / 2) * 3600;
  return [dayStart + UK_OPEN_HOUR * 3600 - offset, dayStart + UK_CLOSE_HOUR * 3600 - offset];
}

/** Every UK window that overlaps the times from `from` to `to` (UTC seconds). */
export function ukWindows(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let day = Math.floor(from / DAY) * DAY - DAY; day <= to; day += DAY) {
    const [start, end] = ukWindow(day);
    if (end > from && start < to) out.push([start, end]);
  }
  return out;
}

/**
 * Position of a time on the chart in bar units, where bar i spans i - 0.5 to i + 0.5,
 * looking only at the first `n` bars. Times in a gap with no bars (nights, weekends)
 * snap to the end of the bar before; times after the last bar run on into the space
 * to its right.
 */
export function timeToEdge(bars: Bar[], tfSeconds: number, time: number, n = bars.length): number {
  if (!n || time <= bars[0].time) return -0.5;
  if (time >= bars[n - 1].time) return n - 1.5 + (time - bars[n - 1].time) / tfSeconds;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo - 0.5 + Math.min(1, (time - bars[lo].time) / tfSeconds);
}

/**
 * Bar ranges (in bar units, as `timeToEdge`) to shade as UK trading hours, over the
 * first `n` bars. A window that has started runs on past the last bar to its close.
 */
export function tradingHourSpans(bars: Bar[], tfSeconds: number, n = bars.length): [number, number][] {
  if (!n) return [];
  const spans: [number, number][] = [];
  for (const [start, end] of ukWindows(bars[0].time, bars[n - 1].time + tfSeconds)) {
    const a = timeToEdge(bars, tfSeconds, start, n);
    const b = timeToEdge(bars, tfSeconds, end, n);
    if (b > a) spans.push([a, b]);
  }
  return spans;
}

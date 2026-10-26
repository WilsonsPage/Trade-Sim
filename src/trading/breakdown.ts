import type { SymbolSpec } from '../data/symbols';
import { pipsBetween } from './bracket';
import type { ClosedTrade } from './engine';

export interface Bucket {
  label: string;
  trades: number;
  wins: number;
  pnl: number;
}

const DAY = 86_400;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Trading sessions by entry hour (UTC). Overlaps go to the later session. */
const SESSIONS: { label: string; from: number; to: number }[] = [
  { label: 'Asia 00–07', from: 0, to: 7 },
  { label: 'London 07–12', from: 7, to: 12 },
  { label: 'London/NY 12–16', from: 12, to: 16 },
  { label: 'New York 16–21', from: 16, to: 21 },
  { label: 'Late 21–24', from: 21, to: 24 },
];

function group(trades: ClosedTrade[], keys: (t: ClosedTrade) => string[], order?: string[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const label of order ?? []) map.set(label, { label, trades: 0, wins: 0, pnl: 0 });
  for (const t of trades) {
    for (const label of keys(t)) {
      const b = map.get(label) ?? { label, trades: 0, wins: 0, pnl: 0 };
      b.trades++;
      if (t.pnl > 0) b.wins++;
      b.pnl += t.pnl;
      map.set(label, b);
    }
  }
  return [...map.values()];
}

const hourOf = (t: ClosedTrade) => new Date(t.entryTime * 1000).getUTCHours();

export const byHour = (trades: ClosedTrade[]) =>
  group(
    trades,
    (t) => [`${String(hourOf(t)).padStart(2, '0')}:00`],
    Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`),
  ).filter((b) => b.trades > 0);

export const byWeekday = (trades: ClosedTrade[]) =>
  group(trades, (t) => [WEEKDAYS[new Date(t.entryTime * 1000).getUTCDay()]], WEEKDAYS.slice(1, 6)).filter(
    (b) => b.trades > 0 || WEEKDAYS.slice(1, 6).includes(b.label),
  );

export const bySession = (trades: ClosedTrade[]) =>
  group(
    trades,
    (t) => [SESSIONS.find((s) => hourOf(t) >= s.from && hourOf(t) < s.to)!.label],
    SESSIONS.map((s) => s.label),
  );

/** Groups by the SL and TP distance each trade started with, e.g. "SL 10 / TP 20". */
export function byBracket(trades: ClosedTrade[], spec: SymbolSpec): Bucket[] {
  const pips = (d: number | null | undefined) => (d ? `${pipsBetween(spec, 0, d)}` : 'none');
  const rank = (d: number | null | undefined) => d ?? Infinity;
  const sorted = [...trades].sort((a, b) => rank(a.risk) - rank(b.risk) || rank(a.reward) - rank(b.reward));
  return group(sorted, (t) => [`SL ${pips(t.risk)} / TP ${pips(t.reward)}`]);
}

/** Trades can have several tags, so one trade counts towards each of its tags. */
export const byTag = (trades: ClosedTrade[]) =>
  group(trades, (t) => (t.tags?.length ? t.tags : ['(no tags)'])).sort((a, b) => b.pnl - a.pnl);

/** Closed P/L per UTC day (by exit time), keyed by day number. */
export function dailyPnl(trades: ClosedTrade[]): Map<number, { pnl: number; trades: number }> {
  const map = new Map<number, { pnl: number; trades: number }>();
  for (const t of trades) {
    const day = Math.floor(t.exitTime / DAY);
    const d = map.get(day) ?? { pnl: 0, trades: 0 };
    d.pnl += t.pnl;
    d.trades++;
    map.set(day, d);
  }
  return map;
}

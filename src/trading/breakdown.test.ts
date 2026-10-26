import { describe, expect, it } from 'vitest';
import type { ClosedTrade } from './engine';
import { symbolSpec } from '../data/symbols';
import { byBracket, bySession, byTag, dailyPnl } from './breakdown';

const trade = (entry: string, pnl: number, tags?: string[]): ClosedTrade => {
  const t = Date.parse(`${entry}Z`) / 1000;
  return { id: entry, side: 'buy', lots: 1, entryPrice: 1, entryTime: t, sl: null, tp: null, exitPrice: 1, exitTime: t + 600, reason: 'manual', pnl, tags };
};

describe('breakdowns', () => {
  const trades = [trade('2026-01-12T08:30:00', 50, ['breakout']), trade('2026-01-12T13:00:00', -20, ['breakout', 'FOMO']), trade('2026-01-13T02:00:00', 10)];

  it('groups by session using the entry hour', () => {
    const s = bySession(trades);
    expect(s.find((b) => b.label.startsWith('London 0'))).toMatchObject({ trades: 1, wins: 1, pnl: 50 });
    expect(s.find((b) => b.label.startsWith('London/NY'))).toMatchObject({ trades: 1, pnl: -20 });
    expect(s.find((b) => b.label.startsWith('Asia'))).toMatchObject({ trades: 1, pnl: 10 });
  });

  it('counts a trade under each of its tags', () => {
    expect(byTag(trades).map((b) => [b.label, b.trades, b.pnl])).toEqual([
      ['breakout', 2, 30],
      ['(no tags)', 1, 10],
      ['FOMO', 1, -20],
    ]);
  });

  it('groups by starting SL/TP distance in pips', () => {
    const withLevels = (risk: number | null, reward: number | null, pnl: number) => ({ ...trade('2026-01-12T08:30:00', pnl), risk, reward });
    const rows = byBracket([withLevels(0.002, 0.004, 40), withLevels(0.001, 0.002, -10), withLevels(0.001, 0.002, 20), withLevels(null, null, 5)], symbolSpec('EURUSD'));
    expect(rows.map((b) => [b.label, b.trades, b.pnl])).toEqual([
      ['SL 10 / TP 20', 2, 10],
      ['SL 20 / TP 40', 1, 40],
      ['SL none / TP none', 1, 5],
    ]);
  });

  it('sums P/L per exit day', () => {
    const d = dailyPnl(trades);
    expect([...d.values()]).toEqual([
      { pnl: 30, trades: 2 },
      { pnl: 10, trades: 1 },
    ]);
  });
});

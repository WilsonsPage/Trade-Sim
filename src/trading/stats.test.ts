import { describe, expect, it } from 'vitest';
import type { ClosedTrade } from './engine';
import { computeStats } from './stats';

const trade = (pnl: number, side: 'buy' | 'sell' = 'buy', r = 1): ClosedTrade => ({
  id: String(Math.random()),
  side,
  lots: 1,
  entryPrice: 1.1,
  entryTime: 0,
  sl: side === 'buy' ? 1.099 : 1.101,
  tp: null,
  exitPrice: 1.1 + (side === 'buy' ? 1 : -1) * 0.001 * r,
  exitTime: 600,
  reason: 'manual',
  pnl,
});

describe('computeStats', () => {
  const s = computeStats([trade(200, 'buy', 2), trade(-100, 'buy', -1), trade(-100, 'sell', -1), trade(300, 'sell', 3)], 10_000);

  it('counts trades, strike rate and P/L', () => {
    expect(s).toMatchObject({ trades: 4, wins: 2, losses: 2, strikeRate: 0.5, netPnl: 300, grossProfit: 500, grossLoss: 200 });
    expect(s.profitFactor).toBe(2.5);
    expect(s.expectancy).toBe(75);
    expect(s.returnPct).toBeCloseTo(0.03);
  });

  it('measures drawdown from the equity peak', () => {
    expect(s.maxDrawdown).toBe(200);
    expect(s.maxDrawdownPct).toBeCloseTo(200 / 10_200);
    expect(s.maxConsecutiveLosses).toBe(2);
  });

  it('averages R multiples and splits longs and shorts', () => {
    expect(s.avgR).toBeCloseTo(0.75);
    expect(s.longs).toEqual({ trades: 2, wins: 1, pnl: 100 });
    expect(s.shorts).toEqual({ trades: 2, wins: 1, pnl: 200 });
  });

  it('keeps break-even trades out of wins and losses', () => {
    const b = computeStats([trade(100), trade(0), trade(-50)], 10_000);
    expect(b).toMatchObject({ trades: 3, wins: 1, losses: 1, breakeven: 1, avgLoss: -50 });
    expect(b.strikeRate).toBeCloseTo(1 / 3);
  });

  it('handles an empty session', () => {
    expect(computeStats([], 10_000)).toMatchObject({ trades: 0, strikeRate: 0, profitFactor: null, avgR: null });
  });
});

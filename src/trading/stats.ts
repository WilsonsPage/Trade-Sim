import type { ClosedTrade } from './engine';

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  /** Share of trades that made money, 0–1. */
  strikeRate: number;
  netPnl: number;
  returnPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  breakeven: number;
  expectancy: number;
  /** Average result in R (multiples of initial risk), for trades that had a stop loss. */
  avgR: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  longs: { trades: number; wins: number; pnl: number };
  shorts: { trades: number; wins: number; pnl: number };
  avgHoldSeconds: number;
}

export function computeStats(history: ClosedTrade[], startBalance: number): Stats {
  const wins = history.filter((t) => t.pnl > 0);
  // Break-even trades count towards the total but are neither wins nor losses.
  const losses = history.filter((t) => t.pnl < 0);
  const sum = (ts: ClosedTrade[]) => ts.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = sum(wins);
  const grossLoss = -sum(losses);
  const netPnl = grossProfit - grossLoss;

  // Drawdown on closed-trade equity.
  let equity = startBalance;
  let peak = startBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const t of history) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    if (peak - equity > maxDrawdown) {
      maxDrawdown = peak - equity;
      maxDrawdownPct = maxDrawdown / peak;
    }
  }

  let streakW = 0;
  let streakL = 0;
  let maxW = 0;
  let maxL = 0;
  for (const t of history) {
    if (t.pnl > 0) {
      streakW++;
      streakL = 0;
    } else if (t.pnl < 0) {
      streakL++;
      streakW = 0;
    } else {
      streakW = 0;
      streakL = 0;
    }
    maxW = Math.max(maxW, streakW);
    maxL = Math.max(maxL, streakL);
  }

  // R multiple: result divided by the price distance to the original stop.
  const rs = history
    .filter((t) => t.sl !== null && t.sl !== t.entryPrice)
    .map((t) => ((t.exitPrice - t.entryPrice) * (t.side === 'buy' ? 1 : -1)) / Math.abs(t.entryPrice - t.sl!));

  const side = (s: 'buy' | 'sell') => {
    const ts = history.filter((t) => t.side === s);
    return { trades: ts.length, wins: ts.filter((t) => t.pnl > 0).length, pnl: sum(ts) };
  };

  const n = history.length;
  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    strikeRate: n ? wins.length / n : 0,
    netPnl,
    returnPct: netPnl / startBalance,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    breakeven: n - wins.length - losses.length,
    expectancy: n ? netPnl / n : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    maxDrawdown,
    maxDrawdownPct,
    maxConsecutiveWins: maxW,
    maxConsecutiveLosses: maxL,
    longs: side('buy'),
    shorts: side('sell'),
    avgHoldSeconds: n ? history.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / n : 0,
  };
}

import type { PendingType, Side } from './engine';

/** Checks SL/TP sit on the right side of `entry` for the trade direction. */
export function levelError(side: Side, entry: number, sl: number | null, tp: number | null): string | null {
  const d = side === 'buy' ? 1 : -1;
  if (sl !== null && (Number.isNaN(sl) || (entry - sl) * d <= 0)) return `Stop loss must be ${side === 'buy' ? 'below' : 'above'} the entry`;
  if (tp !== null && (Number.isNaN(tp) || (tp - entry) * d <= 0)) return `Take profit must be ${side === 'buy' ? 'above' : 'below'} the entry`;
  return null;
}

/** Checks a pending order's price is on the correct side of the market (ask for buys, bid for sells). */
export function pendingPriceError(side: Side, type: PendingType, price: number, bid: number, ask: number): string | null {
  const above = price > (side === 'buy' ? ask : bid);
  const wantAbove = (side === 'buy') === (type === 'stop');
  return above === wantAbove ? null : `A ${side} ${type} must be ${wantAbove ? 'above' : 'below'} the current price`;
}

import type { SymbolSpec } from '../data/symbols';
import type { Side } from './engine';

/** Fixed stop loss and take profit distances in pips; null means none. */
export interface Bracket {
  slPips: number | null;
  tpPips: number | null;
}

/** One level at `pips` from `entry`: below for a buy's SL or a sell's TP, above otherwise. */
export function levelAt(spec: SymbolSpec, side: Side, entry: number, field: 'sl' | 'tp', pips: number): number {
  const up = (side === 'buy') === (field === 'tp');
  return Number((entry + (up ? 1 : -1) * pips * spec.pip).toFixed(spec.digits));
}

/** SL and TP prices for a trade entered at `entry`. */
export function bracketLevels(spec: SymbolSpec, side: Side, entry: number, b: Bracket) {
  return {
    sl: b.slPips ? levelAt(spec, side, entry, 'sl', b.slPips) : null,
    tp: b.tpPips ? levelAt(spec, side, entry, 'tp', b.tpPips) : null,
  };
}

/** Distance between two prices in pips, to one decimal place. */
export const pipsBetween = (spec: SymbolSpec, a: number, b: number) => Math.round((Math.abs(a - b) / spec.pip) * 10) / 10;

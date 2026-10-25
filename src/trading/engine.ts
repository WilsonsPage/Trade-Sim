import type { SymbolSpec } from '../data/symbols';
import type { Bar } from '../types';

export type Side = 'buy' | 'sell';
export type PendingType = 'limit' | 'stop';
export type CloseReason = 'manual' | 'sl' | 'tp' | 'end';

export interface PendingOrder {
  id: string;
  side: Side;
  type: PendingType;
  price: number;
  lots: number;
  sl: number | null;
  tp: number | null;
  placedAt: number;
}

export interface Position {
  id: string;
  side: Side;
  lots: number;
  entryPrice: number;
  entryTime: number;
  sl: number | null;
  tp: number | null;
}

export interface ClosedTrade extends Position {
  exitPrice: number;
  exitTime: number;
  reason: CloseReason;
  /** Profit or loss in account currency (USD). */
  pnl: number;
}

export interface TradingState {
  startBalance: number;
  /** Price data is bid; buys open and sells close this much higher (the ask). */
  spread: number;
  /** Round-turn commission in USD per 1.00 lot, charged when a trade closes. */
  commission: number;
  balance: number;
  positions: Position[];
  orders: PendingOrder[];
  history: ClosedTrade[];
  /** Equity after each closed trade, starting with the opening balance, for drawdown stats. */
  equityCurve: { time: number; equity: number }[];
}

export function initialState(startBalance: number, time: number, spread = 0, commission = 0): TradingState {
  return {
    startBalance,
    spread,
    commission,
    balance: startBalance,
    positions: [],
    orders: [],
    history: [],
    equityCurve: [{ time, equity: startBalance }],
  };
}

const dir = (side: Side) => (side === 'buy' ? 1 : -1);

/**
 * P/L in USD. Pairs quoted in USD (EURUSD, XAUUSD) convert directly; USD-based pairs
 * (USDJPY, USDCHF, USDCAD) are converted at the current price.
 */
export function pnlUsd(spec: SymbolSpec, side: Side, lots: number, entry: number, exit: number): number {
  const quote = (exit - entry) * dir(side) * lots * spec.contractSize;
  return spec.symbol.startsWith('USD') ? quote / exit : quote;
}

/** Price a trade on `side` is opened at, given the bid. */
export const entryPrice = (state: TradingState, side: Side, bid: number) => (side === 'buy' ? bid + (state.spread ?? 0) : bid);

/** Price a trade on `side` is closed at, given the bid. */
export const exitPrice = (state: TradingState, side: Side, bid: number) => (side === 'buy' ? bid : bid + (state.spread ?? 0));

/** P/L of an open position if it were closed now, after commission. */
export function positionPnl(state: TradingState, spec: SymbolSpec, p: Position, bid: number): number {
  return pnlUsd(spec, p.side, p.lots, p.entryPrice, exitPrice(state, p.side, bid)) - (state.commission ?? 0) * p.lots;
}

export function floatingPnl(state: TradingState, spec: SymbolSpec, bid: number): number {
  return state.positions.reduce((sum, p) => sum + positionPnl(state, spec, p, bid), 0);
}

export function openPosition(
  state: TradingState,
  order: Omit<Position, 'id' | 'entryPrice' | 'entryTime'>,
  price: number,
  time: number,
): TradingState {
  const position: Position = { ...order, id: crypto.randomUUID(), entryPrice: price, entryTime: time };
  return { ...state, positions: [...state.positions, position] };
}

export function closePosition(
  state: TradingState,
  spec: SymbolSpec,
  id: string,
  price: number,
  time: number,
  reason: CloseReason,
): TradingState {
  const p = state.positions.find((x) => x.id === id);
  if (!p) return state;
  const pnl = pnlUsd(spec, p.side, p.lots, p.entryPrice, price) - (state.commission ?? 0) * p.lots;
  const balance = state.balance + pnl;
  return {
    ...state,
    balance,
    positions: state.positions.filter((x) => x.id !== id),
    history: [...state.history, { ...p, exitPrice: price, exitTime: time, reason, pnl }],
    equityCurve: [...state.equityCurve, { time, equity: balance }],
  };
}

export function placeOrder(state: TradingState, order: Omit<PendingOrder, 'id'>): TradingState {
  return { ...state, orders: [...state.orders, { ...order, id: crypto.randomUUID() }] };
}

export function cancelOrder(state: TradingState, id: string): TradingState {
  return { ...state, orders: state.orders.filter((o) => o.id !== id) };
}

export function modifyOrder(
  state: TradingState,
  id: string,
  fields: Partial<Pick<PendingOrder, 'price' | 'sl' | 'tp'>>,
): TradingState {
  return { ...state, orders: state.orders.map((o) => (o.id === id ? { ...o, ...fields } : o)) };
}

export function modifyPosition(state: TradingState, id: string, sl: number | null, tp: number | null): TradingState {
  return { ...state, positions: state.positions.map((p) => (p.id === id ? { ...p, sl, tp } : p)) };
}

/** Whether a pending order triggers in this bar, and at what price (the open if price gapped through). */
function pendingFill(o: PendingOrder, bar: Bar): number | null {
  const buyBelow = (o.side === 'buy') === (o.type === 'limit');
  if (buyBelow) {
    // Buy limit / sell stop: trigger when price trades down to the level.
    if (bar.open <= o.price) return bar.open;
    return bar.low <= o.price ? o.price : null;
  }
  // Buy stop / sell limit: trigger when price trades up to the level.
  if (bar.open >= o.price) return bar.open;
  return bar.high >= o.price ? o.price : null;
}

/** Whether SL or TP is hit in this bar. If both are, the stop loss is assumed to hit first. */
function exitFill(p: Position, bar: Bar): { price: number; reason: CloseReason } | null {
  const long = p.side === 'buy';
  if (p.sl !== null) {
    if (long ? bar.open <= p.sl : bar.open >= p.sl) return { price: bar.open, reason: 'sl' };
    if (long ? bar.low <= p.sl : bar.high >= p.sl) return { price: p.sl, reason: 'sl' };
  }
  if (p.tp !== null) {
    if (long ? bar.open >= p.tp : bar.open <= p.tp) return { price: bar.open, reason: 'tp' };
    if (long ? bar.high >= p.tp : bar.low <= p.tp) return { price: p.tp, reason: 'tp' };
  }
  return null;
}

/**
 * Advances the account through one raw (M1) bar: fills pending orders, then checks SL/TP.
 * Buys trigger on the ask and sells on the bid when opening, and the other way round when closing.
 */
export function processBar(state: TradingState, spec: SymbolSpec, bar: Bar): TradingState {
  const spread = state.spread ?? 0;
  const ask: Bar = { ...bar, open: bar.open + spread, high: bar.high + spread, low: bar.low + spread, close: bar.close + spread };
  let s = state;
  for (const o of state.orders) {
    const fill = pendingFill(o, o.side === 'buy' ? ask : bar);
    if (fill === null) continue;
    s = cancelOrder(s, o.id);
    s = openPosition(s, { side: o.side, lots: o.lots, sl: o.sl, tp: o.tp }, fill, bar.time);
  }
  for (const p of s.positions) {
    const exit = exitFill(p, p.side === 'buy' ? bar : ask);
    if (exit) s = closePosition(s, spec, p.id, exit.price, bar.time, exit.reason);
  }
  return s;
}

/** Closes all positions at `price` and drops pending orders. */
export function endSession(state: TradingState, spec: SymbolSpec, bid: number, time: number): TradingState {
  const closed = state.positions.reduce((s, p) => closePosition(s, spec, p.id, exitPrice(s, p.side, bid), time, 'end'), state);
  return { ...closed, orders: [] };
}

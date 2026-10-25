import { describe, expect, it } from 'vitest';
import { symbolSpec } from '../data/symbols';
import { closePosition, endSession, entryPrice, initialState, openPosition, placeOrder, pnlUsd, processBar } from './engine';

const eurusd = symbolSpec('EURUSD');
const bar = (open: number, high: number, low: number, close: number, time = 60) => ({ time, open, high, low, close });

describe('pnlUsd', () => {
  it('values USD-quoted pairs directly', () => {
    expect(pnlUsd(eurusd, 'buy', 1, 1.1, 1.101)).toBeCloseTo(100);
    expect(pnlUsd(eurusd, 'sell', 0.5, 1.1, 1.101)).toBeCloseTo(-50);
    expect(pnlUsd(symbolSpec('XAUUSD'), 'buy', 0.1, 2000, 2010)).toBeCloseTo(100);
  });

  it('converts USD-based pairs at the exit price', () => {
    expect(pnlUsd(symbolSpec('USDJPY'), 'buy', 1, 150, 151)).toBeCloseTo(100_000 / 151);
  });
});

describe('processBar', () => {
  const start = initialState(10_000, 0);

  it('closes a long at its stop loss and books the loss', () => {
    let s = openPosition(start, { side: 'buy', lots: 1, sl: 1.099, tp: 1.102 }, 1.1, 0);
    s = processBar(s, eurusd, bar(1.1, 1.1005, 1.0985, 1.099));
    expect(s.positions).toHaveLength(0);
    expect(s.history[0]).toMatchObject({ reason: 'sl', exitPrice: 1.099 });
    expect(s.balance).toBeCloseTo(9_900);
    expect(s.equityCurve.map((e) => Math.round(e.equity))).toEqual([10_000, 9_900]);
  });

  it('assumes the stop loss hits first when both levels are inside one bar', () => {
    let s = openPosition(start, { side: 'sell', lots: 1, sl: 1.101, tp: 1.099 }, 1.1, 0);
    s = processBar(s, eurusd, bar(1.1, 1.102, 1.098, 1.1));
    expect(s.history[0].reason).toBe('sl');
  });

  it('fills at the open when price gaps through the stop', () => {
    let s = openPosition(start, { side: 'buy', lots: 1, sl: 1.099, tp: null }, 1.1, 0);
    s = processBar(s, eurusd, bar(1.095, 1.096, 1.094, 1.095));
    expect(s.history[0].exitPrice).toBe(1.095);
  });

  it('triggers each pending order type in the right direction', () => {
    const base = { lots: 1, sl: null, tp: null, placedAt: 0 };
    let s = placeOrder(start, { ...base, side: 'buy', type: 'limit', price: 1.099 });
    s = placeOrder(s, { ...base, side: 'buy', type: 'stop', price: 1.102 });
    s = placeOrder(s, { ...base, side: 'sell', type: 'limit', price: 1.102 });
    s = placeOrder(s, { ...base, side: 'sell', type: 'stop', price: 1.099 });
    s = processBar(s, eurusd, bar(1.1, 1.101, 1.0985, 1.1));
    expect(s.orders.map((o) => `${o.side} ${o.type}`).sort()).toEqual(['buy stop', 'sell limit']);
    expect(s.positions.map((p) => `${p.side} ${p.entryPrice}`).sort()).toEqual(['buy 1.099', 'sell 1.099']);
  });

  it('closes manually at the given price', () => {
    let s = openPosition(start, { side: 'buy', lots: 0.1, sl: null, tp: null }, 1.1, 0);
    s = closePosition(s, eurusd, s.positions[0].id, 1.105, 120, 'manual');
    expect(s.history[0].pnl).toBeCloseTo(50);
  });
});

describe('spread and commission', () => {
  // 1 pip spread, $7 per lot round turn.
  const start = initialState(10_000, 0, 0.0001, 7);

  it('opens buys at the ask and charges commission on close', () => {
    let s = openPosition(start, { side: 'buy', lots: 1, sl: null, tp: null }, entryPrice(start, 'buy', 1.1), 0);
    expect(s.positions[0].entryPrice).toBeCloseTo(1.1001);
    s = endSession(s, eurusd, 1.1001, 60);
    expect(s.history[0].pnl).toBeCloseTo(-7);
  });

  it('triggers a sell stop loss on the ask, not the bid', () => {
    let s = openPosition(start, { side: 'sell', lots: 1, sl: 1.1005, tp: null }, 1.1, 0);
    s = processBar(s, eurusd, bar(1.1, 1.10045, 1.0999, 1.1));
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ reason: 'sl', exitPrice: 1.1005 });
    expect(s.history[0].pnl).toBeCloseTo(-57);
  });

  it('fills a buy limit when the ask reaches it', () => {
    let s = placeOrder(start, { side: 'buy', type: 'limit', price: 1.1, lots: 1, sl: null, tp: null, placedAt: 0 });
    s = processBar(s, eurusd, bar(1.1003, 1.1004, 1.09995, 1.1002));
    expect(s.orders).toHaveLength(1);
    s = processBar(s, eurusd, bar(1.1002, 1.1003, 1.0998, 1.1));
    expect(s.positions[0].entryPrice).toBe(1.1);
  });
});

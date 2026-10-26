import { describe, expect, it } from 'vitest';
import { symbolSpec } from '../data/symbols';
import { bracketLevels, pipsBetween } from './bracket';

describe('bracketLevels', () => {
  it('puts SL below and TP above a buy, and the reverse for a sell', () => {
    const eu = symbolSpec('EURUSD');
    expect(bracketLevels(eu, 'buy', 1.1, { slPips: 10, tpPips: 20 })).toEqual({ sl: 1.099, tp: 1.102 });
    expect(bracketLevels(eu, 'sell', 1.1, { slPips: 10, tpPips: null })).toEqual({ sl: 1.101, tp: null });
  });

  it('uses each market pip size', () => {
    expect(bracketLevels(symbolSpec('USDJPY'), 'buy', 150, { slPips: 30, tpPips: 30 })).toEqual({ sl: 149.7, tp: 150.3 });
    expect(bracketLevels(symbolSpec('XAUUSD'), 'sell', 2000, { slPips: 50, tpPips: 100 })).toEqual({ sl: 2005, tp: 1990 });
    expect(pipsBetween(symbolSpec('EURUSD'), 1.1, 1.0985)).toBe(15);
  });
});

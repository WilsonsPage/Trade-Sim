export interface SymbolSpec {
  symbol: string;
  digits: number;
  /** Price move that counts as one pip. */
  pip: number;
  /** Units per 1.00 lot. */
  contractSize: number;
  /** Typical retail spread, used as the default for new sessions. */
  spreadPips: number;
}

const SPECS: Record<string, SymbolSpec> = {
  EURUSD: { symbol: 'EURUSD', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.0 },
  GBPUSD: { symbol: 'GBPUSD', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.4 },
  USDJPY: { symbol: 'USDJPY', digits: 3, pip: 0.01, contractSize: 100_000, spreadPips: 1.2 },
  USDCHF: { symbol: 'USDCHF', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.5 },
  AUDUSD: { symbol: 'AUDUSD', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.2 },
  USDCAD: { symbol: 'USDCAD', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.6 },
  NZDUSD: { symbol: 'NZDUSD', digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 1.6 },
  XAUUSD: { symbol: 'XAUUSD', digits: 2, pip: 0.1, contractSize: 100, spreadPips: 3.0 },
  XAGUSD: { symbol: 'XAGUSD', digits: 3, pip: 0.001, contractSize: 5_000, spreadPips: 25 },
  // Stock indices: $1 per point per lot. Dollar index: $1,000 per point, like the future. Oil: 1,000 barrels.
  UDXUSD: { symbol: 'UDXUSD', digits: 3, pip: 0.01, contractSize: 1_000, spreadPips: 3 },
  SPXUSD: { symbol: 'SPXUSD', digits: 2, pip: 0.1, contractSize: 1, spreadPips: 5 },
  NSXUSD: { symbol: 'NSXUSD', digits: 2, pip: 0.1, contractSize: 1, spreadPips: 10 },
  BCOUSD: { symbol: 'BCOUSD', digits: 3, pip: 0.01, contractSize: 1_000, spreadPips: 3 },
};

const NAMES: Record<string, string> = {
  XAUUSD: 'Gold',
  XAGUSD: 'Silver',
  UDXUSD: 'US Dollar Index',
  SPXUSD: 'S&P 500',
  NSXUSD: 'Nasdaq 100',
  BCOUSD: 'Brent Oil',
};

/** A readable name for markets whose code isn't obvious, e.g. "S&P 500". */
export const symbolName = (symbol: string): string | undefined => NAMES[symbol];

export function symbolSpec(symbol: string): SymbolSpec {
  const key = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  return SPECS[key] ?? { symbol, digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 0 };
}

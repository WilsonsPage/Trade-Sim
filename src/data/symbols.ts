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
};

export function symbolSpec(symbol: string): SymbolSpec {
  const key = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  return SPECS[key] ?? { symbol, digits: 5, pip: 0.0001, contractSize: 100_000, spreadPips: 0 };
}

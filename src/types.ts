import type { DatasetInfo } from './data/load';

export interface Bar {
  /** Bar open time, UTC seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Dataset {
  symbol: string;
  /** Interval of the raw bars in seconds (60 for M1). */
  baseSeconds: number;
  bars: Bar[];
  /** For downloaded data: which months of `info.months` are loaded, so more can be added. */
  window?: { info: DatasetInfo; first: number; last: number };
}

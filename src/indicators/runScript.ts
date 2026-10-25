import type { Bar } from '../types';
import * as ta from './ta';

export interface PlotOptions {
  title?: string;
  color?: string;
  lineWidth?: number;
  /** 'price' draws over the candles; 'new' draws in a pane below the chart. */
  pane?: 'price' | 'new';
}

export interface Plot {
  values: number[];
  options: Required<PlotOptions>;
}

const PALETTE = ['#2962ff', '#ff9800', '#e91e63', '#00bcd4', '#9c27b0', '#8bc34a'];

/** More plots than this from one script is almost certainly a bug (e.g. plot() in a loop). */
export const MAX_PLOTS = 20;

/**
 * Runs an indicator script over the bars revealed so far, so it never sees the future.
 *
 * Scripts get `open`, `high`, `low`, `close`, `time` arrays, `bars`, the `ta` helpers,
 * and `plot(values, options)` / `hline(price, options)` to draw.
 */
export function runScript(code: string, bars: Bar[]): Plot[] {
  const plots: Plot[] = [];
  // Scripts can pass anything, so keep only well-formed numbers and options.
  const plot = (values: number[], options: PlotOptions = {}) => {
    if (plots.length >= MAX_PLOTS) throw new Error(`A script can draw at most ${MAX_PLOTS} plots`);
    const list = Array.isArray(values) ? values : [];
    plots.push({
      values: Array.from({ length: bars.length }, (_, i) => (typeof list[i] === 'number' ? list[i] : NaN)),
      options: {
        title: typeof options?.title === 'string' ? options.title.slice(0, 40) : '',
        color: typeof options?.color === 'string' ? options.color.slice(0, 40) : PALETTE[plots.length % PALETTE.length],
        lineWidth: Math.min(4, Math.max(1, Math.round(Number(options?.lineWidth) || 2))),
        pane: options?.pane === 'new' ? 'new' : 'price',
      },
    });
  };
  const hline = (price: number, options: PlotOptions = {}) =>
    plot(new Array(bars.length).fill(price), { color: '#787b86', lineWidth: 1, ...options });

  const fn = new Function('bars', 'open', 'high', 'low', 'close', 'time', 'ta', 'plot', 'hline', code);
  fn(
    bars,
    bars.map((b) => b.open),
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    bars.map((b) => b.close),
    bars.map((b) => b.time),
    ta,
    plot,
    hline,
  );
  return plots;
}

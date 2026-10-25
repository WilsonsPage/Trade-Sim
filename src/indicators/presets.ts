export interface IndicatorDef {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
}

export const SCRIPT_HELP = `// Arrays: open, high, low, close, time, bars
// Helpers: ta.sma, ta.ema, ta.rma, ta.stdev, ta.rsi, ta.atr, ta.tr, ta.highest, ta.lowest
// Draw: plot(values, { title, color, lineWidth, pane: 'price' | 'new' })
//       hline(price, { color, pane })`;

export const PRESETS: Omit<IndicatorDef, 'id' | 'enabled'>[] = [
  {
    name: 'SMA',
    code: `const length = 20;\nplot(ta.sma(close, length), { title: 'SMA ' + length, color: '#2962ff' });`,
  },
  {
    name: 'EMA',
    code: `const length = 50;\nplot(ta.ema(close, length), { title: 'EMA ' + length, color: '#ff9800' });`,
  },
  {
    name: 'Bollinger Bands',
    code: `const length = 20, mult = 2;
const basis = ta.sma(close, length);
const dev = ta.stdev(close, length);
plot(basis, { title: 'Basis', color: '#ff9800', lineWidth: 1 });
plot(basis.map((b, i) => b + mult * dev[i]), { title: 'Upper', color: '#2962ff', lineWidth: 1 });
plot(basis.map((b, i) => b - mult * dev[i]), { title: 'Lower', color: '#2962ff', lineWidth: 1 });`,
  },
  {
    name: 'RSI',
    code: `const length = 14;
plot(ta.rsi(close, length), { title: 'RSI ' + length, color: '#9c27b0', pane: 'new' });
hline(70, { pane: 'new' });
hline(30, { pane: 'new' });`,
  },
  {
    name: 'ATR',
    code: `const length = 14;\nplot(ta.atr(high, low, close, length), { title: 'ATR ' + length, color: '#00bcd4', pane: 'new' });`,
  },
  {
    name: 'Custom',
    code: `${SCRIPT_HELP}\n\n// Example: fast/slow EMA cross\nplot(ta.ema(close, 9), { title: 'Fast', color: '#26a69a' });\nplot(ta.ema(close, 21), { title: 'Slow', color: '#ef5350' });`,
  },
];

import { describe, expect, it } from 'vitest';
import { MAX_PLOTS, runScript } from './runScript';

const bars = [1, 2, 3].map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c }));

describe('runScript', () => {
  it('keeps only numbers and known options from what a script plots', () => {
    const [p] = runScript(`plot([1, 'x', null], { title: 5, lineWidth: 99, pane: 'evil', color: '#fff' })`, bars);
    expect(p.values).toEqual([1, NaN, NaN]);
    expect(p.options).toEqual({ title: '', color: '#fff', lineWidth: 4, pane: 'price' });
  });

  it('limits the number of plots', () => {
    expect(() => runScript(`for (let i = 0; i < 100; i++) plot(close)`, bars)).toThrow(String(MAX_PLOTS));
  });
});

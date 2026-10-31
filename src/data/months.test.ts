import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync, strToU8 } from 'fflate';
// @ts-expect-error -- plain JS module shared with the Node download script
import { encodeBars } from '../../scripts/codec.mjs';
// @ts-expect-error -- plain JS module shared with the Node download script
import { byMonth } from '../../scripts/store.mjs';
import { hasMoreData, loadMore, loadWindow, monthIndexAt, type DatasetInfo, type MonthChunk } from './load';

// One bar every 6 hours through 2024, split into monthly gzipped files like fetch-data writes.
const bars: number[][] = [];
for (let t = Date.UTC(2024, 0, 1) / 1000; t < Date.UTC(2025, 0, 1) / 1000; t += 6 * 3600) bars.push([t, 1.1, 1.2, 1.0, 1.15]);
const files = new Map<string, Uint8Array>();
const months: MonthChunk[] = [];
for (const [month, rows] of byMonth(bars) as Map<string, number[][]>) {
  const file = `EURUSD/${month}.json.gz`;
  files.set(file, gzipSync(strToU8(JSON.stringify(encodeBars('EURUSD', 60, 5, rows)))));
  months.push({ month, file, from: rows[0][0], to: rows[rows.length - 1][0], count: rows.length });
}
const info: DatasetInfo = { symbol: 'EURUSD', from: bars[0][0], to: bars[bars.length - 1][0], count: bars.length, months };
const at = (iso: string) => Date.parse(iso) / 1000;
const monthOfBar = (t: number) => new Date(t * 1000).toISOString().slice(0, 7);

const fetched: string[] = [];
vi.stubGlobal('fetch', async (url: string) => {
  const file = url.split('/data/')[1];
  fetched.push(file);
  const body = files.get(file);
  return body ? new Response(body as BlobPart) : new Response('missing', { status: 404 });
});
afterEach(() => {
  fetched.length = 0;
});

describe('monthly data files', () => {
  it('splits bars by calendar month', () => {
    expect(months.map((m) => m.month)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => `2024-${m}`));
    expect(months.reduce((n, m) => n + m.count, 0)).toBe(bars.length);
  });

  it('loads a few months either side of the start date', async () => {
    const d = await loadWindow(info, at('2024-06-10'));
    expect(fetched).toEqual(['03', '04', '05', '06', '07', '08', '09'].map((m) => `EURUSD/2024-${m}.json.gz`));
    expect(monthOfBar(d.bars[0].time)).toBe('2024-03');
    expect(monthOfBar(d.bars[d.bars.length - 1].time)).toBe('2024-09');
    expect(hasMoreData(d)).toBe(true);
  });

  it('appends later months without moving earlier bars', async () => {
    const d = await loadWindow(info, at('2024-02-01'));
    expect(monthOfBar(d.bars[0].time)).toBe('2024-01');
    const more = await loadMore(d, at('2024-11-15'));
    expect(more.bars.slice(0, d.bars.length)).toEqual(d.bars);
    expect(monthOfBar(more.bars[more.bars.length - 1].time)).toBe('2024-12');
    expect(more.bars.length).toBe(bars.length);
    expect(hasMoreData(more)).toBe(false);
  });

  it('can keep the first month of a resumed session', async () => {
    const d = await loadWindow(info, at('2024-06-10'), { fromMonth: '2024-05', until: at('2024-10-02') });
    expect(monthOfBar(d.bars[0].time)).toBe('2024-05');
    expect(monthOfBar(d.bars[d.bars.length - 1].time)).toBe('2024-12');
  });

  it('finds the month for a time, clamping outside the data', () => {
    expect(monthIndexAt(info, at('2024-03-15'))).toBe(2);
    expect(monthIndexAt(info, at('2023-01-01'))).toBe(0);
    expect(monthIndexAt(info, at('2030-01-01'))).toBe(11);
  });
});

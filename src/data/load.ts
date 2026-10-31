import type { Bar, Dataset } from '../types';

/** One month of M1 bars for a market, stored as gzipped JSON. */
export interface MonthChunk {
  /** "2024-03" (UTC calendar month). */
  month: string;
  file: string;
  from: number;
  to: number;
  count: number;
}

export interface DatasetInfo {
  symbol: string;
  from: number;
  to: number;
  count: number;
  /** The data split by month, oldest first. */
  months?: MonthChunk[];
  /** Older builds stored each market as one file. */
  file?: string;
}

/** Months loaded before the start date, so the chart has history to read. */
export const HISTORY_MONTHS = 3;
/** Months loaded after the start date (and each time the replay gets near the end). */
export const AHEAD_MONTHS = 3;

type RawBar = [number, number, number, number, number];

/** Lists datasets downloaded with `npm run fetch-data`. Empty if none yet. */
export async function loadIndex(): Promise<DatasetInfo[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
    if (!res.ok) return [];
    return (await res.json()) as DatasetInfo[];
  } catch {
    return [];
  }
}

interface EncodedBars {
  format: 2;
  symbol: string;
  baseSeconds: number;
  digits: number;
  t0: number;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

/** Decodes the compact format written by scripts/codec.mjs. */
export function decodeBars(e: EncodedBars): Dataset {
  const k = 10 ** e.digits;
  const bars: Bar[] = new Array(e.t.length);
  let time = e.t0;
  let prevC = 0;
  for (let i = 0; i < e.t.length; i++) {
    time += e.t[i] * e.baseSeconds;
    const O = prevC + e.o[i];
    const C = O + e.c[i];
    bars[i] = { time, open: O / k, high: (Math.max(O, C) + e.h[i]) / k, low: (Math.min(O, C) - e.l[i]) / k, close: C / k };
    prevC = C;
  }
  return { symbol: e.symbol, baseSeconds: e.baseSeconds, bars };
}

/** Fetches a data file, gunzipping it if needed (the server may already have done so). */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url.split('/data/')[1] ?? url} (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  return JSON.parse(await gunzip(bytes));
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  const { gunzipSync, strFromU8 } = await import('fflate');
  return strFromU8(gunzipSync(bytes));
}

function toDataset(json: unknown): Dataset {
  const j = json as EncodedBars | { symbol: string; baseSeconds: number; bars: RawBar[] };
  if ('format' in j) return decodeBars(j);
  // Files from before the compact format.
  return {
    symbol: j.symbol,
    baseSeconds: j.baseSeconds,
    bars: j.bars.map(([time, open, high, low, close]) => ({ time, open, high, low, close })),
  };
}

const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

/** Loads months `first`..`last` (indexes into `info.months`, inclusive) as one dataset. */
export async function loadMonths(info: DatasetInfo, first: number, last: number): Promise<Dataset> {
  const months = info.months ?? [];
  first = Math.max(0, first);
  last = Math.min(months.length - 1, last);
  const parts = await Promise.all(months.slice(first, last + 1).map(async (m) => toDataset(await fetchJson(dataUrl(m.file)))));
  return {
    symbol: info.symbol,
    baseSeconds: parts[0]?.baseSeconds ?? 60,
    bars: parts.flatMap((p) => p.bars),
    window: { info, first, last },
  };
}

/** Index of the month containing `time` (the nearest one if `time` falls outside the data). */
export function monthIndexAt(info: DatasetInfo, time: number): number {
  const months = info.months ?? [];
  const i = months.findIndex((m) => m.to >= time);
  return i < 0 ? months.length - 1 : i;
}

/**
 * Loads the data a session starting at `startTime` needs: a few months of history before
 * it and a few months to replay. Pass `fromMonth` to keep the same first month as before
 * (a resumed session), and `until` to make sure that time is included.
 */
export async function loadWindow(info: DatasetInfo, startTime: number, opts: { fromMonth?: string; until?: number } = {}): Promise<Dataset> {
  if (!info.months?.length) return loadDataset(info);
  const start = monthIndexAt(info, startTime);
  const pinned = opts.fromMonth ? info.months.findIndex((m) => m.month >= opts.fromMonth!) : -1;
  const first = pinned >= 0 ? pinned : Math.max(0, start - HISTORY_MONTHS);
  const last = Math.max(start, opts.until ? monthIndexAt(info, opts.until) : 0) + AHEAD_MONTHS;
  return loadMonths(info, first, last);
}

/** True if months after the loaded ones exist. */
export const hasMoreData = (d: Dataset) => !!d.window && d.window.last < (d.window.info.months?.length ?? 0) - 1;

/** Appends the next months to `d`, at least up to `until` if given. Earlier bars keep their indexes. */
export async function loadMore(d: Dataset, until?: number): Promise<Dataset> {
  if (!d.window || !hasMoreData(d)) return d;
  const { info, first, last } = d.window;
  const to = Math.max(last, until ? monthIndexAt(info, until) : 0) + AHEAD_MONTHS;
  const next = await loadMonths(info, last + 1, to);
  return { ...d, bars: d.bars.concat(next.bars), window: { info, first, last: next.window!.last } };
}

/** The whole of a market in the single-file layout used by older builds. */
export async function loadDataset(info: DatasetInfo): Promise<Dataset> {
  if (info.months?.length) return loadMonths(info, 0, info.months.length - 1);
  if (!info.file) throw new Error(`No data files listed for ${info.symbol}`);
  return toDataset(await fetchJson(dataUrl(info.file)));
}

function parseTime(date: string, time?: string): number {
  if (/^\d+$/.test(date) && !time) {
    const n = Number(date);
    return n > 1e11 ? Math.floor(n / 1000) : n;
  }
  // MT5 exports dates as 2024.01.02; treat all times as UTC.
  const iso = `${date.replace(/\./g, '-')}T${time ?? '00:00:00'}`.replace(' ', 'T');
  const ms = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Math.floor(ms / 1000);
}

/**
 * Parses an MT5 history export (<DATE> <TIME> <OPEN> ...) or a plain CSV with
 * time,open,high,low,close columns. Bars are assumed to be in UTC.
 */
export function parseCsv(text: string, symbol: string): Dataset {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('File has no rows');
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.replace(/[<>"]/g, '').trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col('date', 'time', 'datetime', 'timestamp');
  const iTime = header[iDate] === 'date' ? col('time') : -1;
  const iO = col('open', 'o');
  const iH = col('high', 'h');
  const iL = col('low', 'l');
  const iC = col('close', 'c');
  if ([iDate, iO, iH, iL, iC].includes(-1)) {
    throw new Error('Expected columns for date/time, open, high, low and close');
  }

  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(sep).map((s) => s.replace(/"/g, '').trim());
    const time = parseTime(f[iDate], iTime >= 0 ? f[iTime] : undefined);
    const bar = { time, open: +f[iO], high: +f[iH], low: +f[iL], close: +f[iC] };
    if (Number.isFinite(time) && Number.isFinite(bar.close)) bars.push(bar);
  }
  bars.sort((a, b) => a.time - b.time);
  if (bars.length < 2) throw new Error('Not enough valid rows');

  let baseSeconds = Infinity;
  for (let i = 1; i < Math.min(bars.length, 500); i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0 && d < baseSeconds) baseSeconds = d;
  }
  return { symbol, baseSeconds, bars };
}

/** Random-walk M1 data so the app is usable before any real data is downloaded. */
export function demoDataset(days = 30): Dataset {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const bars: Bar[] = [];
  const start = Date.UTC(2024, 0, 1) / 1000;
  let price = 1.1;
  for (let m = 0; m < days * 1440; m++) {
    const time = start + m * 60;
    const day = new Date(time * 1000).getUTCDay();
    if (day === 0 || day === 6) continue;
    const open = price;
    const close = open + (rand() - 0.5) * 0.0004;
    const high = Math.max(open, close) + rand() * 0.0002;
    const low = Math.min(open, close) - rand() * 0.0002;
    bars.push({ time, open, high, low, close });
    price = close;
  }
  return { symbol: 'DEMO', baseSeconds: 60, bars };
}

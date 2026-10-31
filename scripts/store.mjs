// Writes downloaded bars in the layout the app reads: one gzipped file per market per
// calendar month (EURUSD/2024-03.json.gz), so a session only fetches the months it needs.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeBars } from './codec.mjs';

/** Groups sorted [time, o, h, l, c] bars by UTC calendar month ("2024-03"). */
export function byMonth(bars) {
  const groups = new Map();
  for (const bar of bars) {
    const month = new Date(bar[0] * 1000).toISOString().slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(bar);
  }
  return groups;
}

/**
 * Replaces everything saved for `symbol` in `outDir` (including the single-file layout
 * used before) and returns its index.json entry and the total size written.
 */
export async function writeSymbol(outDir, symbol, digits, bars) {
  await rm(path.join(outDir, symbol), { recursive: true, force: true });
  await rm(path.join(outDir, `${symbol}.json`), { force: true });
  await mkdir(path.join(outDir, symbol), { recursive: true });
  const months = [];
  let bytes = 0;
  for (const [month, rows] of byMonth(bars)) {
    const file = `${symbol}/${month}.json.gz`;
    const gz = gzipSync(JSON.stringify(encodeBars(symbol, 60, digits, rows)), { level: 9 });
    await writeFile(path.join(outDir, file), gz);
    bytes += gz.length;
    months.push({ month, file, from: rows[0][0], to: rows[rows.length - 1][0], count: rows.length });
  }
  const entry = { symbol, from: bars[0][0], to: bars[bars.length - 1][0], count: bars.length, months };
  return { entry, bytes };
}

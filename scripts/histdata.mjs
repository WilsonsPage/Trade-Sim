// Free M1 history from histdata.com. Completed years come as one file per year, the
// current year as one file per month. Times in the files are fixed EST (UTC-5, no DST).

import { unzipSync, strFromU8 } from 'fflate';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.histdata.com';
const CACHE = path.resolve('.histdata-cache');
const EST_OFFSET = 5 * 3600;
const UA = 'Mozilla/5.0 (compatible; trade-sim data fetcher)';

/** The files covering [from, to]: whole years before this year, months within it. */
function periods(from, to) {
  const now = new Date();
  const out = [];
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
    if (y < now.getUTCFullYear()) {
      out.push({ year: y, month: null });
    } else {
      const first = y === from.getUTCFullYear() ? from.getUTCMonth() + 1 : 1;
      const last = y === to.getUTCFullYear() ? to.getUTCMonth() + 1 : 12;
      for (let m = first; m <= last; m++) out.push({ year: y, month: m });
    }
  }
  return out;
}

async function download(pair, { year, month }) {
  const name = `${pair}_${year}${month ? String(month).padStart(2, '0') : ''}.zip`;
  const cached = path.join(CACHE, name);
  // Past periods never change, so a cached copy is reused; the current month is refetched.
  const now = new Date();
  const isCurrent = month === now.getUTCMonth() + 1 && year === now.getUTCFullYear();
  if (!isCurrent) {
    try {
      return await readFile(cached);
    } catch {
      // Not cached yet.
    }
  }

  const page = `${BASE}/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/${pair.toLowerCase()}/${year}${month ? `/${month}` : ''}`;
  const html = await (await fetch(page, { headers: { 'User-Agent': UA } })).text();
  const form = html.match(/<form[^>]*id="file_down"[\s\S]*?<\/form>/i)?.[0];
  if (!form) throw new Error(`no download form on ${page}`);
  const fields = new URLSearchParams();
  for (const m of form.matchAll(/<input[^>]*>/gi)) {
    const name = m[0].match(/name="([^"]+)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1];
    if (name) fields.set(name, value ?? '');
  }

  const res = await fetch(`${BASE}/get.php`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Referer: page, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: fields,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${name}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`${name} is not a zip (no data for this period yet?)`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(cached, buf);
  return buf;
}

function parse(zip, fromSec, toSec) {
  const files = unzipSync(new Uint8Array(zip));
  const csv = Object.entries(files).find(([n]) => n.toLowerCase().endsWith('.csv'));
  if (!csv) throw new Error('zip has no csv');
  const bars = [];
  for (const line of strFromU8(csv[1]).split('\n')) {
    // 20240102 170000;1.104270;1.104290;1.104250;1.104290;0
    const m = line.match(/^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})\d{2};([\d.]+);([\d.]+);([\d.]+);([\d.]+)/);
    if (!m) continue;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000 + EST_OFFSET;
    if (t < fromSec || t >= toSec) continue;
    bars.push([t, +m[6], +m[7], +m[8], +m[9]]);
  }
  return bars;
}

/** Returns [time, open, high, low, close] rows for the range; `onWarn` reports skipped periods. */
export async function fetchHistdata(symbol, from, to, onWarn) {
  const bars = [];
  for (const p of periods(from, to)) {
    const label = `${symbol} ${p.year}${p.month ? `-${String(p.month).padStart(2, '0')}` : ''}`;
    process.stdout.write(`  ${label} ... `);
    try {
      const rows = parse(await download(symbol, p), from.getTime() / 1000, to.getTime() / 1000);
      bars.push(...rows);
      console.log(`${rows.length} bars`);
    } catch (err) {
      console.log('failed');
      onWarn(`${label} skipped: ${err.message}`);
    }
  }
  return bars.sort((a, b) => a[0] - b[0]);
}

// Downloads free M1 history from Dukascopy into public/data/ for the replay app.
//
//   npm run fetch-data                                  -> all symbols, last 6 months
//   npm run fetch-data -- EURUSD XAUUSD                 -> chosen symbols, last 6 months
//   npm run fetch-data -- --from 2024-01-01 --to 2024-07-01 GBPUSD
//
// Raw downloads are cached in .dukascopy-cache so re-running is fast.

import { getHistoricalRates } from 'dukascopy-node';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'XAUUSD'];
const OUT_DIR = path.resolve('public/data');
const DIGITS = { USDJPY: 3, XAUUSD: 3 };
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function parseArgs(argv) {
  const args = { symbols: [], from: null, to: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else args.symbols.push(a.toUpperCase());
  }
  if (!args.symbols.length) args.symbols = SYMBOLS;
  const to = args.to ? new Date(args.to) : new Date();
  const from = args.from ? new Date(args.from) : new Date(to.getTime() - 182 * 86400_000);
  return { symbols: args.symbols, from, to };
}

// Split the range into calendar months so progress is visible and failures are local.
function monthChunks(from, to) {
  const chunks = [];
  let start = new Date(from);
  while (start < to) {
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    chunks.push([start, end < to ? end : to]);
    start = end;
  }
  return chunks;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dukascopy answers 503 when hit too fast, so requests are paced and each month gets
// a few attempts with a growing pause before it is skipped.
async function fetchMonth(symbol, start, end) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await getHistoricalRates({
        instrument: symbol.toLowerCase(),
        dates: { from: start, to: end },
        timeframe: 'm1',
        priceType: 'bid',
        format: 'array',
        volumes: false,
        ignoreFlats: true,
        useCache: true,
        cacheFolderPath: '.dukascopy-cache',
        batchSize: 1,
        requestIntervalMs: 500,
        retryCount: 5,
        pauseBetweenRetriesMs: 3000,
      });
    } catch (err) {
      if (attempt >= 3 || Date.now() >= deadline) throw err;
      const wait = 20_000 * attempt;
      process.stdout.write(`(${err.message}; retrying in ${wait / 1000}s) `);
      await sleep(wait);
    }
  }
}

// Surfaces problems as annotations on the GitHub Actions run.
function notice(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=fetch-data::${message}`);
}

function warn(message) {
  console.warn(`  ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=fetch-data::${message.replace(/\r?\n/g, ' ')}`);
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

// Optional time budget (FETCH_MINUTES). Dukascopy throttles cloud IPs, so CI downloads a
// slice per run, newest months first; the cache makes each later run pick up where the
// last one stopped.
const BUDGET_MS = Number(process.env.FETCH_MINUTES) * 60_000 || Infinity;
const deadline = Date.now() + BUDGET_MS;

function withDeadline(promise) {
  const left = deadline - Date.now();
  if (!Number.isFinite(left)) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('time budget reached')), Math.max(left, 0)).unref()),
  ]);
}

async function main() {
  const { symbols, from, to } = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });
  let index = await readIndex();
  const bars = Object.fromEntries(symbols.map((s) => [s, []]));

  console.log(`Downloading M1 bars ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);
  outer: for (const [start, end] of monthChunks(from, to).reverse()) {
    for (const symbol of symbols) {
      const label = `${symbol} ${start.toISOString().slice(0, 7)}`;
      if (Date.now() >= deadline) {
        warn(`time budget reached before ${label}; the next run continues from the cache`);
        break outer;
      }
      process.stdout.write(`  ${label} ... `);
      try {
        const rows = await withDeadline(fetchMonth(symbol, start, end));
        const d = DIGITS[symbol] ?? 5;
        for (const [t, o, h, l, c] of rows) bars[symbol].push([Math.floor(t / 1000), round(o, d), round(h, d), round(l, d), round(c, d)]);
        console.log(`${rows.length} bars`);
      } catch (err) {
        console.log('failed');
        warn(`${label} skipped: ${err.message}`);
        if (Date.now() >= deadline) break outer;
      }
    }
  }

  for (const symbol of symbols) {
    const list = bars[symbol].sort((a, b) => a[0] - b[0]);
    if (!list.length) {
      warn(`${symbol}: no data downloaded`);
      continue;
    }
    const file = `${symbol}.json`;
    await writeFile(path.join(OUT_DIR, file), JSON.stringify({ symbol, baseSeconds: 60, bars: list }));
    index = index.filter((d) => d.symbol !== symbol);
    index.push({ symbol, file, from: list[0][0], to: list[list.length - 1][0], count: list.length });
    console.log(`  saved ${file} (${list.length} bars)`);
    notice(`${symbol}: saved ${list.length} bars`);
  }
  index.sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
}

process.on('exit', (code) => notice(`finished with exit code ${code}`));
main()
  .catch((err) => {
    warn(`crashed: ${err.stack ?? err}`);
    process.exitCode = 1;
  })
  // Abandoned requests may still be pending; don't wait for them.
  .finally(() => process.exit());

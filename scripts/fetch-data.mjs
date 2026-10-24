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

async function fetchSymbol(symbol, from, to) {
  const bars = [];
  for (const [start, end] of monthChunks(from, to)) {
    process.stdout.write(`  ${symbol} ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)} ... `);
    const rows = await getHistoricalRates({
      instrument: symbol.toLowerCase(),
      dates: { from: start, to: end },
      timeframe: 'm1',
      priceType: 'bid',
      format: 'array',
      volumes: false,
      ignoreFlats: true,
      useCache: true,
      cacheFolderPath: '.dukascopy-cache',
      batchSize: 10,
      pauseBetweenBatchesMs: 500,
      retryCount: 3,
    });
    const d = DIGITS[symbol] ?? 5;
    for (const [t, o, h, l, c] of rows) bars.push([Math.floor(t / 1000), round(o, d), round(h, d), round(l, d), round(c, d)]);
    console.log(`${rows.length} bars`);
  }
  return bars;
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

async function main() {
  const { symbols, from, to } = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });
  let index = await readIndex();

  console.log(`Downloading M1 bars ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);
  for (const symbol of symbols) {
    if (!SYMBOLS.includes(symbol)) console.warn(`  ${symbol} is not in the default list; trying anyway`);
    try {
      const bars = await fetchSymbol(symbol, from, to);
      if (!bars.length) {
        console.warn(`  ${symbol}: no data returned, skipped`);
        continue;
      }
      const file = `${symbol}.json`;
      await writeFile(path.join(OUT_DIR, file), JSON.stringify({ symbol, baseSeconds: 60, bars }));
      index = index.filter((d) => d.symbol !== symbol);
      index.push({ symbol, file, from: bars[0][0], to: bars[bars.length - 1][0], count: bars.length });
      await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
      console.log(`  saved ${file} (${bars.length} bars)`);
    } catch (err) {
      console.error(`  ${symbol} failed: ${err.message}`);
    }
  }
}

main();

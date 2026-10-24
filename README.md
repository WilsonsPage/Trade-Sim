# Trade Sim

A bar-replay trading simulator: replay historical charts bar by bar, take fake trades, and review your stats at the end of each session.

## Getting started

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run fetch-data      # download ~6 months of M1 data for forex majors and gold (free, from Dukascopy)
npm run dev             # open the printed http://localhost:5173 link
```

`fetch-data` options:

```bash
npm run fetch-data -- EURUSD XAUUSD                          # only some symbols
npm run fetch-data -- --from 2023-01-01 --to 2024-01-01      # a custom date range
```

Downloaded data lives in `public/data/` and is not committed. You can also import a CSV (an MT5 history export, or `time,open,high,low,close`), or use the built-in demo data.

## Replay controls

| Action | Button | Key |
| --- | --- | --- |
| Next bar | ⏭ Step | → |
| Play / pause | ▶ Play | Space |
| Speed | bars/s dropdown | |
| Change timeframe mid-replay | timeframe dropdown | |

## Roadmap

1. ✅ Data and replay chart
2. Trading engine: market buy/sell, lot size, SL/TP, pending limit and stop orders, positions panel
3. Saved sessions and end-of-session stats (trades, PnL, strike rate, drawdown, equity curve)
4. Polish and mobile (installable PWA)

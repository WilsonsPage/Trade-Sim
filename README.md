# Trade Sim

A bar-replay trading simulator: replay historical charts bar by bar, take fake trades, and review your stats at the end of each session.

## Use it

Open **https://wilsonspage.github.io/Trade-Sim/** in Chrome or Edge. Nothing to install, and market data for forex majors and gold (last 12 months, refreshed weekly) is already included.

To get it as an app:

- **Laptop (Chrome/Edge):** click the install icon at the right of the address bar. It then opens in its own window from your Start menu or Dock.
- **Android:** Chrome menu → *Add to Home screen*.
- **iPhone:** Safari share button → *Add to Home Screen*.

The site is built and published by `.github/workflows/deploy.yml` on every push to `main` and every Monday.

## Run it locally (for development)

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

## Drawing tools

Use the toolbar on the left of the chart: trend line, horizontal line, vertical line and box. Click once (horizontal/vertical) or twice (trend line, box) to place. With the arrow tool, drag a drawing to move it, drag its handles to reshape it, pick a colour to recolour it, and press Delete to remove it. Drawings are saved per symbol in your browser.

## Indicators and custom scripts

**ƒx Indicators** adds SMA, EMA, Bollinger Bands, RSI and ATR, or a custom script. Every indicator is a small JavaScript script you can edit. Scripts only see bars revealed so far, so there is no look-ahead.

```js
// Arrays: open, high, low, close, time, bars
// Helpers: ta.sma, ta.ema, ta.rma, ta.stdev, ta.rsi, ta.atr, ta.tr, ta.highest, ta.lowest
// Draw: plot(values, { title, color, lineWidth, pane: 'price' | 'new' }), hline(price, { color, pane })
const fast = ta.ema(close, 9);
const slow = ta.ema(close, 21);
plot(fast, { title: 'Fast', color: '#26a69a' });
plot(slow, { title: 'Slow', color: '#ef5350' });
```

## Roadmap

1. ✅ Data and replay chart
2. Trading engine: market buy/sell, lot size, SL/TP, pending limit and stop orders, positions panel
3. Saved sessions and end-of-session stats (trades, PnL, strike rate, drawdown, equity curve)
4. Polish and mobile (installable PWA)

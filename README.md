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

## Trading

The right-hand panel works like the MT5 mobile app:

- **Market execution**: set volume (lots), optional stop loss and take profit, then **SELL** or **BUY** at the current price. Risk, reward and R:R are shown as you type.
- **Pending orders**: Buy Limit, Sell Limit, Buy Stop and Sell Stop at a price you choose, with optional SL/TP.
- **Positions**: live P/L. Tap a position to modify SL/TP or close it.
- **History**: closed trades with exit reason (SL, TP or manual).
- Entries, SL/TP and pending orders appear as lines on the chart, and fills as markers.

Orders fill on M1 data inside each chart bar. If SL and TP are both touched in the same minute, the stop loss is assumed to hit first, and a gap through a level fills at the open. P/L is in USD (USD-based pairs such as USDJPY are converted at the exit price). Spread and commission are not modelled yet.

## Sessions and stats

Every session autosaves in your browser (IndexedDB) as you replay and trade. Use **←** to leave, then **Resume** it later from the start screen. **End session** closes anything open at the current price and shows the report: net P/L, return, trade count, strike rate, profit factor, max drawdown, average R, expectancy, average/largest win and loss, streaks, average hold time, a long/short split, an equity curve and the full trade list. Finished sessions stay listed so you can compare them.

## Roadmap

1. ✅ Data and replay chart
2. ✅ Drawing tools, indicators and trading engine
3. ✅ Saved sessions and end-of-session stats
4. Polish and mobile (installable PWA)

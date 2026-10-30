# Trade Sim

A bar-replay trading simulator: replay historical charts bar by bar, take fake trades, and review your stats at the end of each session.

## Use it

Open **https://wilsonspage.github.io/Trade-Sim/** in Chrome or Edge. Nothing to install, and no account. Market data for the last 12 months, refreshed weekly, is already included: the forex majors, gold, silver, the US dollar index, the S&P 500, the Nasdaq 100 and Brent oil.

To get it as an app:

- **Laptop (Chrome/Edge):** click the install icon at the right of the address bar. It then opens in its own window from your Start menu or Dock.
- **Android:** Chrome menu → *Add to Home screen*.
- **iPhone:** Safari share button → *Add to Home Screen*.

Press **+ New sim** and answer a few quick questions: challenge or free practice, which challenge (1-step, 2-step or custom), one chart or split screen, which market(s) and timeframe, then the start date and account size. Your saved sessions are listed under the button.

The site is built and published by `.github/workflows/deploy.yml` on every push to `main` and every Monday.

## Run it locally (for development)

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run fetch-data      # download ~6 months of M1 data for all markets (free, from histdata.com)
npm run dev             # open the printed http://localhost:5173 link
```

`fetch-data` options:

```bash
npm run fetch-data -- EURUSD XAUUSD                          # only some symbols
npm run fetch-data -- --from 2023-01-01 --to 2024-01-01      # a custom date range
npm run fetch-data -- --source dukascopy                     # Dukascopy: includes the current month, but blocks most cloud servers
```

Downloaded data lives in `public/data/` and is not committed. You can also import a CSV (an MT5 history export, or `time,open,high,low,close`), or use the built-in demo data.

## Replay controls

| Action | Button | Key |
| --- | --- | --- |
| Next bar | ⏭ Step | → |
| Step back (undoes anything that happened in that step) | ⏮ Back | ← |
| Jump to the next Tokyo / London / New York open, or a date | Go to ▾ | |
| Play / pause | ▶ Play | Space |
| Speed | bars/s dropdown | |
| Change timeframe mid-replay | timeframe dropdown | |
| Shade 08:00–20:00 UK time on each day | 🕗 UK hours | |

**UK hours** is off by default and remembered on your device. It shades the hours you'd be at the screen in green (UK clock time, so it shifts by an hour in UTC when the clocks change) on both charts. It's only a guide: you can still trade outside it.

## Split screen

When starting a new sim, choose **Split screen** and pick a second market to watch another market next to the one you trade, for example EURUSD with the dollar index. Both charts replay in sync from the same date, and each has its own timeframe, indicators and drawings. On a laptop, the ⬒ button switches between side by side and stacked. Trading happens on the first chart.

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
- Entries, SL/TP and pending orders appear as lines on the chart, and fills as markers. **Drag** an SL, TP or pending-order line to move it (invalid levels snap back). Dragging an order's entry carries its SL and TP with it.
- **Trade from the chart**: right-click (long-press on a phone) at a price to place a buy/sell limit or stop there. Each order and position line has **TP** and **SL** buttons that add the level, ready to drag into place, and **✕** to cancel, close or remove a level.
- **Fixed SL/TP in pips**: switch *Stop loss* or *Take profit* to *(pips)* and every new trade gets that distance from its entry, e.g. SL 10 / TP 20. It also applies to right-click orders and the TP/SL buttons on chart lines. The report's *Starting SL / TP* table compares results for each setting, so you can test 10/20 against 20/40 and see which works best.
- **Auto breakeven**: under the order form, choose *at +1R* (or 0.5R–3R) and the stop loss moves to entry once a trade is that far in profit. Trades show a **BE** badge when it has happened.
- **Risk sizing**: switch *Volume (lots)* to *Risk (% of balance)* and the lot size is worked out from your stop loss.
- **Costs**: set spread (pips) and commission ($ per lot, round turn) when starting a session. Buys open at the ask and close at the bid; sells the other way round.

Orders fill on M1 data inside each chart bar. If SL and TP are both touched in the same minute, the stop loss is assumed to hit first, and a gap through a level fills at the open. P/L is in USD (USD-based pairs such as USDJPY are converted at the exit price) and includes commission. Swap and margin are not modelled.

## Journal and analytics

Tap any open position or closed trade (History tab) to add **notes**, **tags** (e.g. *breakout, A+ setup, FOMO*) and a **📷 screenshot** of the chart, drawings included. The end-of-session report adds a **P/L calendar**, results by **session**, **day of week**, **hour** and **tag** (trades, win rate and P/L for each), and your notes, tags and screenshots next to every trade. Screenshots are stored in your browser with the session and deleted with it.

## Prop firm challenge mode

When starting a new sim, choose **Prop firm challenge**, then *2-step phase 1* (8% target, 5% daily loss, 10% max loss, 4 trading days), *phase 2* (5% / 5% / 10%), *1-step* (10% / 3% / 6%) or your own numbers. The panel tracks progress to the target and how much loss room is left. Like a real evaluation, limits use equity including open trades (at the worst price each minute), the daily limit resets at 00:00 UTC from that day's starting balance, and breaking a limit closes everything and stops trading. The challenge passes once the target is banked with no trades open and the minimum trading days are met. The result shows on the session list and in the report.

## Sessions and stats

Every session autosaves in your browser (IndexedDB) as you replay and trade. Use **←** to leave, then **Resume** it later from the start screen. **End session** closes anything open at the current price and shows the report: net P/L, return, trade count, strike rate, profit factor, max drawdown, average R, expectancy, average/largest win and loss, streaks, average hold time, a long/short split, an equity curve and the full trade list. Finished sessions stay listed so you can compare them.

## Privacy and security

- **No accounts, nothing uploaded.** Sessions, drawings and indicators are saved only in the browser on the device you use (IndexedDB and local storage). Each device and browser has its own separate sessions. Clearing your browser's site data deletes them.
- **No server.** The site is static files on GitHub Pages; the market data is bundled with it.
- **Content Security Policy.** The page only loads its own scripts, styles and data, and can't send anything to other sites.
- **Sandboxed indicator scripts.** Custom scripts run in a separate worker with network, storage and other browser APIs removed, and are stopped after 2 seconds, so a script copied from someone else can't read or delete your sessions, contact other sites, or freeze the app.
- **Updates.** Dependabot opens pull requests for library and GitHub Actions updates, and each pull request is tested and built before it can be merged.

Found a security problem? Please report it privately through the repository's **Security → Report a vulnerability** page rather than in a public issue.

## Roadmap

1. ✅ Data and replay chart
2. ✅ Drawing tools, indicators and trading engine
3. ✅ Saved sessions and end-of-session stats
4. ✅ Polish and mobile: phone layout, draggable levels, spread/commission, risk sizing, compact data
5. ✅ Split screen with a second market, more markets, security hardening
6. ✅ Trading from the chart, step back, go to session, auto breakeven, prop firm challenges, journal and analytics
7. ✅ Step-by-step new sim wizard

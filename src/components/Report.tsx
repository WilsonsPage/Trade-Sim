import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import { symbolSpec } from '../data/symbols';
import type { SavedSession } from '../sessions/sessions';
import { computeStats } from '../trading/stats';
import { byBracket, byHour, bySession, byTag, byWeekday, dailyPnl, type Bucket } from '../trading/breakdown';
import type { ClosedTrade } from '../trading/engine';
import { Shot } from './Journal';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtTime = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
const duration = (s: number) => (s < 3600 ? `${Math.round(s / 60)}m` : s < 86_400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86_400).toFixed(1)}d`);

function EquityChart({ session }: { session: SavedSession }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = createChart(ref.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#b2b5be' },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      timeScale: { timeVisible: true },
    });
    const balance = chart.addSeries(AreaSeries, {
      lineColor: '#2962ff',
      topColor: 'rgba(41, 98, 255, 0.3)',
      bottomColor: 'rgba(41, 98, 255, 0)',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    // Several trades can close in the same second; keep the last equity for each time.
    const line = (pts: { time: number; equity: number }[]) => {
      const points = new Map<number, number>();
      for (const p of pts) points.set(p.time, p.equity);
      return [...points].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value }));
    };
    balance.setData(line(session.trading.equityCurve));
    const samples = session.trading.equitySamples;
    if (samples?.length) {
      // Equity with open trades marked to market; equals the balance whenever no trade is open.
      const equity = chart.addSeries(LineSeries, {
        color: '#ff9800',
        lineWidth: 1,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      equity.setData(line([...session.trading.equityCurve, ...samples].sort((a, b) => a.time - b.time)));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [session]);
  return <div ref={ref} className="equity-chart" />;
}

const DAY = 86_400;
/** Short money for calendar cells: whole dollars, e.g. -$32. */
const compact = (n: number) => `${n < 0 ? '-' : '+'}$${Math.round(Math.abs(n)).toLocaleString()}`;

/** Month grids of closed P/L per day, like a trading journal calendar. */
function PnlCalendar({ trades }: { trades: ClosedTrade[] }) {
  const days = dailyPnl(trades);
  const keys = [...days.keys()];
  const first = new Date(Math.min(...keys) * DAY * 1000);
  const last = new Date(Math.max(...keys) * DAY * 1000);
  const months: Date[] = [];
  for (let m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); m <= last; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    months.push(m);
  }
  return (
    <div className="calendars">
      {months.map((m) => {
        const start = m.getTime() / 1000 / DAY;
        const length = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
        const lead = (m.getUTCDay() + 6) % 7; // Monday first
        const monthPnl = Array.from({ length }, (_, i) => days.get(start + i)?.pnl ?? 0).reduce((a, b) => a + b, 0);
        return (
          <div key={start} className="calendar">
            <div className="row">
              <strong className="grow">{m.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
              <span className={monthPnl >= 0 ? 'profit' : 'loss'}>{money(monthPnl)}</span>
            </div>
            <div className="cal-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} className="cal-head muted small">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length }, (_, i) => {
                const d = days.get(start + i);
                return (
                  <span key={i} className={`cal-day${d ? (d.pnl >= 0 ? ' up' : ' down') : ''}`} title={d ? `${d.trades} trade(s)` : ''}>
                    <span className="muted small">{i + 1}</span>
                    {d && <strong className="small">{compact(d.pnl)}</strong>}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  return (
    <div className="breakdown">
      <h3>{title}</h3>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="muted">{r.trades}</td>
              <td className="muted">{r.trades ? pct(r.wins / r.trades) : '—'}</td>
              <td className={r.pnl >= 0 ? 'profit' : 'loss'}>{money(r.pnl)}</td>
              <td className="bar-cell">
                <span className={`bar ${r.pnl >= 0 ? 'up' : 'down'}`} style={{ width: `${(Math.abs(r.pnl) / max) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Report({ session, onBack }: { session: SavedSession; onBack: () => void }) {
  const s = computeStats(session.trading.history, session.startBalance);
  const spec = symbolSpec(session.symbol);
  // Sessions saved before equity tracking only have the closed-trade (balance) drawdown.
  const dd = session.trading.equityDrawdown;

  const tiles: [string, string, string?][] = [
    ['Net P/L', money(s.netPnl), s.netPnl >= 0 ? 'profit' : 'loss'],
    ['Return', pct(s.returnPct), s.returnPct >= 0 ? 'profit' : 'loss'],
    ['Trades', `${s.trades} (${s.wins}W / ${s.losses}L${s.breakeven ? ` / ${s.breakeven}BE` : ''})`],
    ['Strike rate', s.trades ? pct(s.strikeRate) : '—'],
    ['Profit factor', s.profitFactor === null ? '—' : s.profitFactor.toFixed(2)],
    [
      'Max equity drawdown',
      dd ? `${money(dd.max)} (${pct(dd.maxPct)})` : '—',
      dd && dd.max > 0 ? 'loss' : undefined,
    ],
    ['Max balance drawdown', `${money(s.maxDrawdown)} (${pct(s.maxDrawdownPct)})`, s.maxDrawdown > 0 ? 'loss' : undefined],
    ['Avg R', s.avgR === null ? '—' : `${s.avgR.toFixed(2)}R`],
    ['Expectancy', `${money(s.expectancy)} / trade`],
    ['Avg win', money(s.avgWin), 'profit'],
    ['Avg loss', money(s.avgLoss), 'loss'],
    ['Largest win', money(s.largestWin), 'profit'],
    ['Largest loss', money(s.largestLoss), 'loss'],
    ['Win / loss streak', `${s.maxConsecutiveWins} / ${s.maxConsecutiveLosses}`],
    ['Avg hold time', s.trades ? duration(s.avgHoldSeconds) : '—'],
    ['Longs', `${s.longs.trades} · ${s.longs.trades ? pct(s.longs.wins / s.longs.trades) : '—'} · ${money(s.longs.pnl)}`],
    ['Shorts', `${s.shorts.trades} · ${s.shorts.trades ? pct(s.shorts.wins / s.shorts.trades) : '—'} · ${money(s.shorts.pnl)}`],
  ];

  return (
    <div className="report">
      <div className="row">
        <button onClick={onBack}>← Sessions</button>
        <h1 className="grow">
          {session.symbol} session report
        </h1>
      </div>
      <p className="muted">
        Started {fmtTime(session.startTime)} with {money(session.startBalance)} · finished with{' '}
        {money(session.trading.balance)}
      </p>

      {session.trading.challenge && (
        <div className={`challenge challenge-${session.trading.challenge.status} report-challenge`}>
          <div className="row">
            <strong className="grow">{session.trading.challenge.rules.name} challenge</strong>
            <span className={`badge challenge-${session.trading.challenge.status}`}>
              {session.trading.challenge.status === 'active' ? 'not passed' : session.trading.challenge.status}
            </span>
          </div>
          <span className="muted small">
            Target {pct(session.trading.challenge.rules.profitTarget)} · daily loss limit{' '}
            {pct(session.trading.challenge.rules.dailyLoss)} · max loss limit {pct(session.trading.challenge.rules.maxLoss)}
            {session.trading.challenge.rules.minTradingDays > 0 &&
              ` · at least ${session.trading.challenge.rules.minTradingDays} trading days`}
            {session.trading.challenge.decidedAt && ` · decided ${fmtTime(session.trading.challenge.decidedAt)} UTC`}
          </span>
          {session.trading.challenge.reason && <span className="error small">{session.trading.challenge.reason}</span>}
        </div>
      )}

      <div className="stat-grid">
        {tiles.map(([label, value, cls]) => (
          <div key={label} className="stat">
            <span className="muted small">{label}</span>
            <strong className={cls}>{value}</strong>
          </div>
        ))}
      </div>

      <h2>Equity</h2>
      {session.trading.equitySamples?.length ? (
        <p className="muted small">
          Blue is the balance after each closed trade; orange is equity with open trades marked to market.
          {dd?.maxTime && ` The deepest equity drawdown was reached ${fmtTime(dd.maxTime)} UTC.`}
        </p>
      ) : null}
      {s.trades ? <EquityChart session={session} /> : <p className="muted">No trades were taken in this session.</p>}

      {s.trades > 0 && (
        <>
          <h2>P/L calendar</h2>
          <PnlCalendar trades={session.trading.history} />

          <h2>When and how you win</h2>
          <p className="muted small">Trades · win rate · P/L, grouped by the SL/TP each trade started with, when it was opened (UTC), and your tags.</p>
          <div className="breakdowns">
            <BreakdownTable title="Starting SL / TP (pips)" rows={byBracket(session.trading.history, spec)} />
            <BreakdownTable title="Session (UTC hours)" rows={bySession(session.trading.history)} />
            <BreakdownTable title="Day of week" rows={byWeekday(session.trading.history)} />
            <BreakdownTable title="Hour" rows={byHour(session.trading.history)} />
            <BreakdownTable title="Tag" rows={byTag(session.trading.history)} />
          </div>

          <h2>Trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Side</th>
                  <th>Lots</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Exit</th>
                  <th>P/L</th>
                  <th>Journal</th>
                </tr>
              </thead>
              <tbody>
                {session.trading.history.map((t, i) => (
                  <tr key={t.id}>
                    <td>{i + 1}</td>
                    <td className={t.side}>{t.side}</td>
                    <td>{t.lots.toFixed(2)}</td>
                    <td>{t.entryPrice.toFixed(spec.digits)}</td>
                    <td>{t.exitPrice.toFixed(spec.digits)}</td>
                    <td>{fmtTime(t.entryTime)}</td>
                    <td>{fmtTime(t.exitTime)}</td>
                    <td>{t.reason.toUpperCase()}</td>
                    <td className={t.pnl >= 0 ? 'profit' : 'loss'}>{money(t.pnl)}</td>
                    <td className="journal-cell">
                      {t.tags?.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      {t.note && <div className="note-text">{t.note}</div>}
                      {t.hasShot && <Shot tradeId={t.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

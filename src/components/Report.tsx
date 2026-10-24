import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, type UTCTimestamp } from 'lightweight-charts';
import { symbolSpec } from '../data/symbols';
import type { SavedSession } from '../sessions/sessions';
import { computeStats } from '../trading/stats';

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
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#2962ff',
      topColor: 'rgba(41, 98, 255, 0.3)',
      bottomColor: 'rgba(41, 98, 255, 0)',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    // Several trades can close in the same second; keep the last equity for each time.
    const points = new Map<number, number>();
    for (const p of session.trading.equityCurve) points.set(p.time, p.equity);
    series.setData([...points].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [session]);
  return <div ref={ref} className="equity-chart" />;
}

export function Report({ session, onBack }: { session: SavedSession; onBack: () => void }) {
  const s = computeStats(session.trading.history, session.startBalance);
  const spec = symbolSpec(session.symbol);

  const tiles: [string, string, string?][] = [
    ['Net P/L', money(s.netPnl), s.netPnl >= 0 ? 'profit' : 'loss'],
    ['Return', pct(s.returnPct), s.returnPct >= 0 ? 'profit' : 'loss'],
    ['Trades', `${s.trades} (${s.wins}W / ${s.losses}L${s.breakeven ? ` / ${s.breakeven}BE` : ''})`],
    ['Strike rate', s.trades ? pct(s.strikeRate) : '—'],
    ['Profit factor', s.profitFactor === null ? '—' : s.profitFactor.toFixed(2)],
    ['Max drawdown', `${money(s.maxDrawdown)} (${pct(s.maxDrawdownPct)})`, s.maxDrawdown > 0 ? 'loss' : undefined],
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

      <div className="stat-grid">
        {tiles.map(([label, value, cls]) => (
          <div key={label} className="stat">
            <span className="muted small">{label}</span>
            <strong className={cls}>{value}</strong>
          </div>
        ))}
      </div>

      <h2>Equity</h2>
      {s.trades ? <EquityChart session={session} /> : <p className="muted">No trades were taken in this session.</p>}

      {s.trades > 0 && (
        <>
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

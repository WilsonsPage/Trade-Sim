import { useEffect, useState } from 'react';
import { demoDataset, loadDataset, loadIndex, parseCsv, type DatasetInfo } from '../data/load';
import { symbolName, symbolSpec } from '../data/symbols';
import { TIMEFRAMES } from '../data/timeframes';
import {
  deleteSession,
  listSessions,
  loadSource,
  storeImported,
  type DatasetSource,
  type SavedSession,
} from '../sessions/sessions';
import type { TradingState } from '../trading/engine';
import type { Dataset } from '../types';

export interface SessionConfig {
  id: string;
  createdAt: number;
  dataset: Dataset;
  source: DatasetSource;
  tfSeconds: number;
  /** An optional second chart that follows the main chart's replay time. */
  second?: SecondChart;
  startTime: number;
  startBalance: number;
  /** Spread in pips and round-turn commission in USD per lot. */
  spreadPips: number;
  commission: number;
  /** Set when resuming a saved session. */
  initialPos?: number;
  initialTrading?: TradingState;
}

export interface SecondChart {
  dataset: Dataset;
  source: DatasetSource;
  tfSeconds: number;
}

const tfLabel = (s: number) => TIMEFRAMES.find((tf) => tf.seconds === s)?.label ?? `${s}s`;
const fmtMoney = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;

const toDateInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const fromDateInput = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000;

interface Props {
  onStart: (c: SessionConfig) => void;
  onReport: (s: SavedSession) => void;
}

export function Setup({ onStart, onReport }: Props) {
  const [index, setIndex] = useState<DatasetInfo[] | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [source, setSource] = useState<DatasetSource | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [tfSeconds, setTfSeconds] = useState(900);
  const [start, setStart] = useState('');
  const [balance, setBalance] = useState('10000');
  const [spread, setSpread] = useState('0');
  const [commission, setCommission] = useState('0');
  const [status, setStatus] = useState('');
  const [second, setSecond] = useState<SecondChart | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex);
    listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  const resume = async (s: SavedSession) => {
    setStatus(`Loading ${s.symbol}…`);
    try {
      const d = await loadSource(s.source);
      const second = s.second && { dataset: await loadSource(s.second.source), source: s.second.source, tfSeconds: s.second.tfSeconds };
      onStart({
        id: s.id,
        createdAt: s.createdAt,
        dataset: d,
        source: s.source,
        tfSeconds: s.tfSeconds,
        second,
        startTime: s.startTime,
        startBalance: s.startBalance,
        spreadPips: 0,
        commission: 0,
        initialPos: s.pos,
        initialTrading: s.trading,
      });
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const remove = async (s: SavedSession) => {
    if (!confirm(`Delete this ${s.symbol} session?`)) return;
    await deleteSession(s.id);
    setSessions(await listSessions());
  };

  const choose = (d: Dataset, src: DatasetSource) => {
    setDataset(d);
    setSource(src);
    if (second?.dataset.symbol === d.symbol) setSecond(null);
    setSpread(String(symbolSpec(d.symbol).spreadPips));
    if (!TIMEFRAMES.some((tf) => tf.seconds === tfSeconds && tf.seconds >= d.baseSeconds)) {
      setTfSeconds(TIMEFRAMES.find((tf) => tf.seconds >= d.baseSeconds)?.seconds ?? d.baseSeconds);
    }
    // Default to a start point a third of the way in, so there is history on the chart.
    const bars = d.bars;
    setStart(toDateInput(bars[Math.floor(bars.length / 3)].time));
    setStatus('');
  };

  const pickDownloaded = async (info: DatasetInfo) => {
    setStatus(`Loading ${info.symbol}…`);
    try {
      choose(await loadDataset(info), { kind: 'download', info });
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const pickSecond = async (info: DatasetInfo | null) => {
    if (!info) return setSecond(null);
    setStatus(`Loading ${info.symbol}…`);
    try {
      setSecond({ dataset: await loadDataset(info), source: { kind: 'download', info }, tfSeconds });
      setStatus('');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const importFile = async (file: File) => {
    try {
      const symbol = file.name.match(/^[A-Za-z]{6}/)?.[0].toUpperCase() ?? file.name.replace(/\.\w+$/, '');
      const d = parseCsv(await file.text(), symbol);
      choose(d, await storeImported(d).catch((): DatasetSource => ({ kind: 'import', key: '' })));
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    }
  };

  // With two charts, the start date must fall where both have data.
  const ranges = [dataset, second?.dataset].filter((d): d is Dataset => !!d).map((d) => d.bars);
  const first = ranges.length ? Math.max(...ranges.map((b) => b[0].time)) : undefined;
  const last = ranges.length ? Math.min(...ranges.map((b) => b[b.length - 1].time)) : undefined;
  const label = (symbol: string) => (symbolName(symbol) ? `${symbol} · ${symbolName(symbol)}` : symbol);

  return (
    <div className="setup">
      <h1>Trade Sim</h1>
      <p className="muted">Pick a market, timeframe and start date, then replay the bars and trade them.</p>

      {sessions.length > 0 && (
        <>
          <h2>Your sessions</h2>
          <div className="sessions">
            {sessions.map((s) => {
              const pnl = s.trading.balance - s.startBalance;
              return (
                <div key={s.id} className="session-row">
                  <div className="grow">
                    <strong>{s.symbol}</strong> {tfLabel(s.tfSeconds)}
                    {s.second && (
                      <>
                        {' + '}
                        <strong>{s.second.symbol}</strong> {tfLabel(s.second.tfSeconds)}
                      </>
                    )}{' '}
                    <span className="muted small">from {toDateInput(s.startTime)}</span>
                    <div className="muted small">
                      {s.trading.history.length} trades ·{' '}
                      <span className={pnl >= 0 ? 'profit' : 'loss'}>{fmtMoney(pnl)}</span> ·{' '}
                      {s.endedAt ? 'finished' : 'in progress'} · saved {new Date(s.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  {s.endedAt ? (
                    <button onClick={() => onReport(s)}>Report</button>
                  ) : (
                    <button onClick={() => resume(s)}>Resume</button>
                  )}
                  <button onClick={() => remove(s)} title="Delete session">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <h2>New session</h2>
        </>
      )}

      <h2>1. Market data</h2>
      {index === null && <p className="muted">Looking for downloaded data…</p>}
      {index?.length === 0 && (
        <p className="muted">
          No market data found. Try the demo data or import a CSV below. (Running locally? Use{' '}
          <code>npm run fetch-data</code> to download market data.)
        </p>
      )}
      <div className="chips">
        {index?.map((info) => (
          <button
            key={info.symbol}
            className={dataset?.symbol === info.symbol ? 'chip active' : 'chip'}
            onClick={() => pickDownloaded(info)}
            title={`${toDateInput(info.from)} → ${toDateInput(info.to)}`}
          >
            {label(info.symbol)}
          </button>
        ))}
        <button className={dataset?.symbol === 'DEMO' ? 'chip active' : 'chip'} onClick={() => choose(demoDataset(), { kind: 'demo' })}>
          Demo data
        </button>
        <label className="chip">
          Import CSV…
          <input type="file" accept=".csv,.txt" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </div>
      {status && <p className="muted">{status}</p>}

      {dataset && (
        <>
          <p className="muted">
            {dataset.symbol}: {dataset.bars.length.toLocaleString()} bars from {toDateInput(first!)} to {toDateInput(last!)}
          </p>

          <h2>2. Timeframe</h2>
          <div className="chips">
            {TIMEFRAMES.filter((tf) => tf.seconds >= dataset.baseSeconds).map((tf) => (
              <button
                key={tf.label}
                className={tf.seconds === tfSeconds ? 'chip active' : 'chip'}
                onClick={() => setTfSeconds(tf.seconds)}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {index && index.length > 1 && (
            <>
              <h2>3. Second chart (optional)</h2>
              <p className="muted small">
                Watch another market next to {dataset.symbol}, replaying in sync. You trade on {dataset.symbol}.
              </p>
              <div className="chips second-pick">
                <button className={second ? 'chip' : 'chip active'} onClick={() => pickSecond(null)}>
                  None
                </button>
                {index
                  .filter((info) => info.symbol !== dataset.symbol)
                  .map((info) => (
                    <button
                      key={info.symbol}
                      className={second?.dataset.symbol === info.symbol ? 'chip active' : 'chip'}
                      onClick={() => pickSecond(info)}
                    >
                      {label(info.symbol)}
                    </button>
                  ))}
              </div>
              {second && (
                <div className="chips second-tf">
                  {TIMEFRAMES.filter((tf) => tf.seconds >= second.dataset.baseSeconds).map((tf) => (
                    <button
                      key={tf.label}
                      className={tf.seconds === second.tfSeconds ? 'chip active' : 'chip'}
                      onClick={() => setSecond({ ...second, tfSeconds: tf.seconds })}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <h2>{index && index.length > 1 ? 4 : 3}. Start replay from</h2>
          {first! > last! && <p className="error">These two markets have no dates in common. Pick another second chart.</p>}
          <input
            type="date"
            value={start}
            min={toDateInput(first!)}
            max={toDateInput(last!)}
            onChange={(e) => setStart(e.target.value)}
          />

          <h2>{index && index.length > 1 ? 5 : 4}. Account</h2>
          <div className="row account-setup">
            <label className="field">
              Starting balance (USD)
              <input type="number" min="100" step="100" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </label>
            <label className="field">
              Spread (pips)
              <input type="number" min="0" step="0.1" value={spread} onChange={(e) => setSpread(e.target.value)} />
            </label>
            <label className="field">
              Commission ($ per lot, round turn)
              <input type="number" min="0" step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} />
            </label>
          </div>

          <div>
            <button
              className="primary"
              disabled={!start || !(Number(balance) > 0) || first! > last!}
              onClick={() =>
                onStart({
                  id: crypto.randomUUID(),
                  createdAt: Date.now(),
                  dataset,
                  source: source!,
                  tfSeconds,
                  second: second ?? undefined,
                  startTime: Math.max(fromDateInput(start), first!),
                  startBalance: Number(balance),
                  spreadPips: Math.max(0, Number(spread) || 0),
                  commission: Math.max(0, Number(commission) || 0),
                })
              }
            >
              Start replay
            </button>
          </div>
        </>
      )}
    </div>
  );
}

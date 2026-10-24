import { useEffect, useState } from 'react';
import { demoDataset, loadDataset, loadIndex, parseCsv, type DatasetInfo } from '../data/load';
import { TIMEFRAMES } from '../data/timeframes';
import type { Dataset } from '../types';

export interface SessionConfig {
  dataset: Dataset;
  tfSeconds: number;
  startTime: number;
}

const toDateInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const fromDateInput = (s: string) => Date.parse(`${s}T00:00:00Z`) / 1000;

export function Setup({ onStart }: { onStart: (c: SessionConfig) => void }) {
  const [index, setIndex] = useState<DatasetInfo[] | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [tfSeconds, setTfSeconds] = useState(900);
  const [start, setStart] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);

  const choose = (d: Dataset) => {
    setDataset(d);
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
      choose(await loadDataset(info));
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const importFile = async (file: File) => {
    try {
      const symbol = file.name.match(/^[A-Za-z]{6}/)?.[0].toUpperCase() ?? file.name.replace(/\.\w+$/, '');
      choose(parseCsv(await file.text(), symbol));
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
    }
  };

  const first = dataset?.bars[0].time;
  const last = dataset?.bars[dataset.bars.length - 1].time;

  return (
    <div className="setup">
      <h1>Trade Sim</h1>
      <p className="muted">Pick a market, timeframe and start date, then replay the bars and trade them.</p>

      <h2>1. Market data</h2>
      {index === null && <p className="muted">Looking for downloaded data…</p>}
      {index?.length === 0 && (
        <p className="muted">
          No market data found. Try the demo data or import a CSV below. (Running locally? Use{' '}
          <code>npm run fetch-data</code> to download forex majors and gold.)
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
            {info.symbol}
          </button>
        ))}
        <button className={dataset?.symbol === 'DEMO' ? 'chip active' : 'chip'} onClick={() => choose(demoDataset())}>
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

          <h2>3. Start replay from</h2>
          <input
            type="date"
            value={start}
            min={toDateInput(first!)}
            max={toDateInput(last!)}
            onChange={(e) => setStart(e.target.value)}
          />

          <div>
            <button
              className="primary"
              disabled={!start}
              onClick={() => onStart({ dataset, tfSeconds, startTime: fromDateInput(start) })}
            >
              Start replay
            </button>
          </div>
        </>
      )}
    </div>
  );
}

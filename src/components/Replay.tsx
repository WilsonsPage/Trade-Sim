import { useEffect, useState } from 'react';
import { symbolSpec } from '../data/symbols';
import { TIMEFRAMES } from '../data/timeframes';
import { SPEEDS, useReplay } from '../replay/useReplay';
import { ReplayChart } from './ReplayChart';
import type { SessionConfig } from './Setup';

const fmtTime = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);

export function Replay({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const { dataset, startTime } = config;
  const [tfSeconds, setTfSeconds] = useState(config.tfSeconds);
  const replay = useReplay(dataset, tfSeconds, startTime);
  const spec = symbolSpec(dataset.symbol);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        replay.togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        replay.step();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay]);

  return (
    <div className="replay">
      <header className="toolbar">
        <button onClick={onExit} title="Back to setup">
          ←
        </button>
        <strong>{dataset.symbol}</strong>
        <select value={tfSeconds} onChange={(e) => setTfSeconds(+e.target.value)}>
          {TIMEFRAMES.filter((tf) => tf.seconds >= dataset.baseSeconds).map((tf) => (
            <option key={tf.label} value={tf.seconds}>
              {tf.label}
            </option>
          ))}
        </select>
        <span className="divider" />
        <button onClick={replay.togglePlay} disabled={replay.atEnd} title="Play / pause (Space)">
          {replay.playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button onClick={replay.step} disabled={replay.atEnd} title="Next bar (→)">
          ⏭ Step
        </button>
        <select value={replay.speed} onChange={(e) => replay.setSpeed(+e.target.value)} title="Bars per second">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} bar{s > 1 ? 's' : ''}/s
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="muted">{fmtTime(replay.time)} UTC</span>
        <strong>{replay.price.toFixed(spec.digits)}</strong>
      </header>

      <main className="body">
        <ReplayChart view={replay.view} digits={spec.digits} />
        <aside className="panel">
          <h3>Positions</h3>
          <p className="muted">Buy/sell, SL/TP, lot size and pending orders arrive in step 2.</p>
          {replay.atEnd && <p className="notice">End of data reached.</p>}
        </aside>
      </main>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { symbolSpec } from '../data/symbols';
import { TIMEFRAMES } from '../data/timeframes';
import { loadDrawings, saveDrawings, type Drawing, type DrawingTool } from '../drawings/types';
import type { IndicatorDef } from '../indicators/presets';
import { SPEEDS, useReplay } from '../replay/useReplay';
import { saveSession, type SavedSession } from '../sessions/sessions';
import { useTrading } from '../trading/useTrading';
import { COLORS, DrawingToolbar } from './DrawingToolbar';
import { DrawingLayer } from './DrawingLayer';
import { IndicatorLayer } from './IndicatorLayer';
import { IndicatorsDialog } from './IndicatorsDialog';
import { ReplayChart } from './ReplayChart';
import { TradeLines } from './TradeLines';
import { TradePanel } from './TradePanel';
import type { SessionConfig } from './Setup';

const fmtTime = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);

const INDICATORS_KEY = 'trade-sim:indicators';

function loadIndicators(): IndicatorDef[] {
  try {
    return JSON.parse(localStorage.getItem(INDICATORS_KEY) ?? '[]') as IndicatorDef[];
  } catch {
    return [];
  }
}

interface Props {
  config: SessionConfig;
  onExit: () => void;
  onEnd: (session: SavedSession) => void;
}

export function Replay({ config, onExit, onEnd }: Props) {
  const { dataset, startTime } = config;
  const [tfSeconds, setTfSeconds] = useState(config.tfSeconds);
  const replay = useReplay(dataset, tfSeconds, startTime, config.initialPos);
  const spec = useMemo(() => symbolSpec(dataset.symbol), [dataset.symbol]);
  const trading = useTrading(dataset, spec, replay.pos, config.startBalance, config.initialTrading);

  const snapshot = (trades = trading.state, endedAt: number | null = null): SavedSession => ({
    id: config.id,
    symbol: dataset.symbol,
    source: config.source,
    tfSeconds,
    startTime,
    startBalance: config.startBalance,
    pos: replay.pos,
    trading: trades,
    createdAt: config.createdAt,
    updatedAt: Date.now(),
    endedAt,
  });

  // Autosave shortly after anything changes, so closing the tab loses nothing.
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      saveSession(latest.current()).then(() => setSaveError(false), () => setSaveError(true));
    }, 1000);
    return () => clearTimeout(id);
  }, [replay.pos, trading.state, tfSeconds]);

  const ended = useRef(false);
  useEffect(
    () => () => {
      if (!ended.current) saveSession(latest.current()).catch(() => {});
    },
    [],
  );

  const endSession = async () => {
    const open = trading.state.positions.length + trading.state.orders.length;
    const msg = open
      ? `End the session? ${open} open position(s)/order(s) will be closed at the current price.`
      : 'End the session and see your results?';
    if (!confirm(msg)) return;
    ended.current = true;
    const session = snapshot(trading.end(), Date.now());
    await saveSession(session).catch(() => setSaveError(true));
    onEnd(session);
  };

  const [drawings, setDrawings] = useState<Drawing[]>(() => loadDrawings(dataset.symbol));
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [indicators, setIndicators] = useState<IndicatorDef[]>(loadIndicators);
  const [indicatorErrors, setIndicatorErrors] = useState<Record<string, string>>({});
  const [showIndicators, setShowIndicators] = useState(false);

  const changeDrawings = (next: Drawing[]) => {
    setDrawings(next);
    saveDrawings(dataset.symbol, next);
  };

  const changeIndicators = (next: IndicatorDef[]) => {
    setIndicators(next);
    try {
      localStorage.setItem(INDICATORS_KEY, JSON.stringify(next));
    } catch {
      // Not persisted.
    }
  };

  const changeColor = (c: string) => {
    setColor(c);
    if (selectedId) changeDrawings(drawings.map((d) => (d.id === selectedId ? { ...d, color: c } : d)));
  };

  const onIndicatorErrors = useCallback((e: Record<string, string>) => setIndicatorErrors(e), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showIndicators) return;
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
  }, [replay, showIndicators]);

  return (
    <div className="replay">
      <header className="toolbar">
        <button onClick={onExit} title="Back to sessions (progress is saved)">
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
        <button onClick={() => setShowIndicators(true)}>
          ƒx Indicators{indicators.some((d) => d.enabled) ? ` (${indicators.filter((d) => d.enabled).length})` : ''}
        </button>
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
        {saveError && <span className="error small">Not saved</span>}
        <span className="muted">{fmtTime(replay.time)} UTC</span>
        <strong>{replay.price.toFixed(spec.digits)}</strong>
        <button className="end-btn" onClick={endSession}>
          End session
        </button>
      </header>

      <main className="body">
        <DrawingToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={changeColor}
          canDelete={!!selectedId}
          onDelete={() => {
            changeDrawings(drawings.filter((d) => d.id !== selectedId));
            setSelectedId(null);
          }}
          onClear={() => {
            if (drawings.length && confirm('Remove all drawings on this chart?')) changeDrawings([]);
          }}
        />
        <ReplayChart view={replay.view} digits={spec.digits}>
          {(api) => (
            <>
              <IndicatorLayer api={api} view={replay.view} defs={indicators} onErrors={onIndicatorErrors} />
              <TradeLines api={api} state={trading.state} tfSeconds={tfSeconds} now={replay.time} />
              <DrawingLayer
                api={api}
                bars={replay.view.bars}
                tfSeconds={tfSeconds}
                drawings={drawings}
                onChange={changeDrawings}
                tool={tool}
                onToolDone={() => setTool(null)}
                color={color}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </>
          )}
        </ReplayChart>
        <aside className="panel">
          {replay.atEnd && <p className="notice">End of data reached.</p>}
          <TradePanel trading={trading} spec={spec} />
        </aside>
      </main>

      {showIndicators && (
        <IndicatorsDialog
          defs={indicators}
          errors={indicatorErrors}
          onChange={changeIndicators}
          onClose={() => setShowIndicators(false)}
        />
      )}
    </div>
  );
}

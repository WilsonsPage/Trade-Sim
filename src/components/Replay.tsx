import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { symbolName, symbolSpec } from '../data/symbols';
import { TIMEFRAMES } from '../data/timeframes';
import { loadDrawings, saveDrawings, type Drawing, type DrawingTool } from '../drawings/types';
import type { IndicatorDef } from '../indicators/presets';
import { SPEEDS, useFollowReplay, useReplay } from '../replay/useReplay';
import { saveSession, type SavedSession } from '../sessions/sessions';
import { useTrading } from '../trading/useTrading';
import { levelError, pendingPriceError } from '../trading/validate';
import { COLORS, DrawingToolbar } from './DrawingToolbar';
import { DrawingLayer } from './DrawingLayer';
import { IndicatorLayer } from './IndicatorLayer';
import { IndicatorsDialog } from './IndicatorsDialog';
import { ReplayChart } from './ReplayChart';
import { TradeLines, type DragTarget } from './TradeLines';
import { TradePanel } from './TradePanel';
import type { SessionConfig } from './Setup';

const fmtTime = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16);

const INDICATORS_KEY = 'trade-sim:indicators';
const LAYOUT_KEY = 'trade-sim:split-layout';

function loadJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function storeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted.
  }
}

/** Drawings for one chart, saved per symbol. */
function useDrawings(symbol: string | null) {
  const [drawings, setDrawings] = useState<Drawing[]>(() => (symbol ? loadDrawings(symbol) : []));
  const change = useCallback(
    (next: Drawing[]) => {
      setDrawings(next);
      if (symbol) saveDrawings(symbol, next);
    },
    [symbol],
  );
  return [drawings, change] as const;
}

/** Indicators for one chart slot (the main chart and the second chart keep separate lists). */
function useIndicators(key: string) {
  const [defs, setDefs] = useState<IndicatorDef[]>(() => loadJson(key, []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (next: IndicatorDef[]) => {
    setDefs(next);
    storeJson(key, next);
  };
  const onErrors = useCallback((e: Record<string, string>) => setErrors(e), []);
  return { defs, change, errors, onErrors, enabled: defs.filter((d) => d.enabled).length };
}

interface Props {
  config: SessionConfig;
  onExit: () => void;
  onEnd: (session: SavedSession) => void;
}

export function Replay({ config, onExit, onEnd }: Props) {
  const { dataset, startTime, second } = config;
  const [tfSeconds, setTfSeconds] = useState(config.tfSeconds);
  const [tf2, setTf2] = useState(second?.tfSeconds ?? config.tfSeconds);
  const replay = useReplay(dataset, tfSeconds, startTime, config.initialPos);
  const follow = useFollowReplay(second?.dataset ?? null, tf2, replay.time, startTime);
  const spec = useMemo(() => symbolSpec(dataset.symbol), [dataset.symbol]);
  const spec2 = useMemo(() => second && symbolSpec(second.dataset.symbol), [second]);
  const trading = useTrading(
    dataset,
    spec,
    replay.pos,
    { startBalance: config.startBalance, spread: config.spreadPips * spec.pip, commission: config.commission },
    config.initialTrading,
  );

  const snapshot = (trades = trading.state, endedAt: number | null = null): SavedSession => ({
    id: config.id,
    symbol: dataset.symbol,
    source: config.source,
    tfSeconds,
    second: second && { symbol: second.dataset.symbol, source: second.source, tfSeconds: tf2 },
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
  }, [replay.pos, trading.state, tfSeconds, tf2]);

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

  const [drawings, changeDrawings] = useDrawings(dataset.symbol);
  const [drawings2, changeDrawings2] = useDrawings(second?.dataset.symbol ?? null);
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const indicators = useIndicators(INDICATORS_KEY);
  const indicators2 = useIndicators(`${INDICATORS_KEY}:second`);
  const [indicatorsFor, setIndicatorsFor] = useState<1 | 2 | null>(null);
  const dialogIndicators = indicatorsFor === 2 ? indicators2 : indicators;

  const [stacked, setStacked] = useState(() => loadJson(LAYOUT_KEY, false));
  const toggleLayout = () => {
    setStacked(!stacked);
    storeJson(LAYOUT_KEY, !stacked);
  };

  const changeColor = (c: string) => {
    setColor(c);
    if (!selectedId) return;
    const recolor = (list: Drawing[]) => list.map((d) => (d.id === selectedId ? { ...d, color: c } : d));
    if (drawings.some((d) => d.id === selectedId)) changeDrawings(recolor(drawings));
    else changeDrawings2(recolor(drawings2));
  };

  const deleteSelected = () => {
    if (drawings.some((d) => d.id === selectedId)) changeDrawings(drawings.filter((d) => d.id !== selectedId));
    else changeDrawings2(drawings2.filter((d) => d.id !== selectedId));
    setSelectedId(null);
  };

  /** Applies a dragged SL/TP/order line if the new level is valid. */
  const onDragLine = (target: DragTarget, raw: number) => {
    const price = Number(raw.toFixed(spec.digits));
    const { positions, orders } = trading.state;
    if (target.kind === 'position') {
      const p = positions.find((x) => x.id === target.id);
      if (!p) return false;
      const sl = target.field === 'sl' ? price : p.sl;
      const tp = target.field === 'tp' ? price : p.tp;
      if (levelError(p.side, p.side === 'buy' ? trading.price : trading.ask, sl, tp)) return false;
      trading.modify(p.id, sl, tp);
      return true;
    }
    const o = orders.find((x) => x.id === target.id);
    if (!o) return false;
    const next = { price: o.price, sl: o.sl, tp: o.tp, [target.field]: price };
    if (target.field === 'price' && pendingPriceError(o.side, o.type, price, trading.price, trading.ask)) return false;
    if (levelError(o.side, next.price, next.sl, next.tp)) return false;
    trading.modifyOrder(o.id, next);
    return true;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (indicatorsFor) return;
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
  }, [replay, indicatorsFor]);

  const drawingProps = {
    tool,
    onToolDone: () => setTool(null),
    color,
    selectedId,
    onSelect: setSelectedId,
  };

  return (
    <div className="replay">
      <header className="toolbar">
        <button onClick={onExit} title="Back to sessions (progress is saved)">
          ←
        </button>
        <strong>{dataset.symbol}</strong>
        <select value={tfSeconds} onChange={(e) => setTfSeconds(+e.target.value)}>
          <TimeframeOptions baseSeconds={dataset.baseSeconds} />
        </select>
        <button onClick={() => setIndicatorsFor(1)}>ƒx Indicators{indicators.enabled ? ` (${indicators.enabled})` : ''}</button>
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
        {second && (
          <button className="layout-btn" onClick={toggleLayout} title={stacked ? 'Show charts side by side' : 'Stack charts'}>
            {stacked ? '◫' : '⬒'}
          </button>
        )}
        <span className="spacer" />
        {saveError && <span className="error small">Not saved</span>}
        <span className="muted clock">{fmtTime(replay.time)} UTC</span>
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
          onDelete={deleteSelected}
          onClear={() => {
            if ((drawings.length || drawings2.length) && confirm('Remove all drawings on these charts?')) {
              changeDrawings([]);
              changeDrawings2([]);
            }
          }}
        />
        <div className={`charts${second ? ' split' : ''}${stacked ? ' stacked' : ''}`}>
          <section className="chart-slot">
            {second && (
              <div className="slot-head">
                <strong>{dataset.symbol}</strong>
                <span className="muted small">{symbolName(dataset.symbol) ?? ''} · you trade this chart</span>
              </div>
            )}
            <ReplayChart view={replay.view} digits={spec.digits}>
              {(api) => (
                <>
                  <IndicatorLayer api={api} view={replay.view} defs={indicators.defs} onErrors={indicators.onErrors} />
                  <TradeLines api={api} state={trading.state} tfSeconds={tfSeconds} now={replay.time} onDrag={onDragLine} />
                  <DrawingLayer
                    api={api}
                    bars={replay.view.bars}
                    tfSeconds={tfSeconds}
                    drawings={drawings}
                    onChange={changeDrawings}
                    {...drawingProps}
                  />
                </>
              )}
            </ReplayChart>
          </section>
          {second && spec2 && (
            <section className="chart-slot">
              <div className="slot-head">
                <strong>{second.dataset.symbol}</strong>
                <select value={tf2} onChange={(e) => setTf2(+e.target.value)}>
                  <TimeframeOptions baseSeconds={second.dataset.baseSeconds} />
                </select>
                <button onClick={() => setIndicatorsFor(2)}>ƒx{indicators2.enabled ? ` (${indicators2.enabled})` : ''}</button>
                <span className="spacer" />
                <strong>{follow.price?.toFixed(spec2.digits) ?? ''}</strong>
              </div>
              {follow.view ? (
                <ReplayChart view={follow.view} digits={spec2.digits}>
                  {(api) => (
                    <>
                      <IndicatorLayer api={api} view={follow.view!} defs={indicators2.defs} onErrors={indicators2.onErrors} />
                      <DrawingLayer
                        api={api}
                        bars={follow.view!.bars}
                        tfSeconds={tf2}
                        drawings={drawings2}
                        onChange={changeDrawings2}
                        {...drawingProps}
                      />
                    </>
                  )}
                </ReplayChart>
              ) : (
                <div className="chart chart-empty muted">
                  No {second.dataset.symbol} data before {fmtTime(second.dataset.bars[0].time).slice(0, 10)}
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="panel">
          {replay.atEnd && <p className="notice">End of data reached.</p>}
          <TradePanel trading={trading} spec={spec} />
        </aside>
      </main>

      {indicatorsFor && (
        <IndicatorsDialog
          title={indicatorsFor === 2 && second ? `Indicators on ${second.dataset.symbol}` : undefined}
          defs={dialogIndicators.defs}
          errors={dialogIndicators.errors}
          onChange={dialogIndicators.change}
          onClose={() => setIndicatorsFor(null)}
        />
      )}
    </div>
  );
}

function TimeframeOptions({ baseSeconds }: { baseSeconds: number }) {
  return TIMEFRAMES.filter((tf) => tf.seconds >= baseSeconds).map((tf) => (
    <option key={tf.label} value={tf.seconds}>
      {tf.label}
    </option>
  ));
}

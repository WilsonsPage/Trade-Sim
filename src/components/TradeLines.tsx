import { useEffect, useRef, useState } from 'react';
import {
  createSeriesMarkers,
  LineStyle,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { SymbolSpec } from '../data/symbols';
import { levelAt, type Bracket } from '../trading/bracket';
import type { TradingState } from '../trading/engine';
import type { ChartApi } from './ReplayChart';

const BUY = '#2962ff';
const SELL = '#ef5350';

/** A line that can be dragged to a new price. */
export interface DragTarget {
  kind: 'position' | 'order';
  id: string;
  field: 'sl' | 'tp' | 'price';
}

/** A click on one of the small buttons drawn on an entry, order, SL or TP line. */
export type LineAction =
  /** `fallback` is tried if `price` isn't valid (e.g. a fixed-pip SL the market has already passed). */
  | { type: 'add'; target: DragTarget; price: number; fallback?: number }
  | { type: 'remove'; target: DragTarget }
  | { type: 'close'; id: string }
  | { type: 'cancel'; id: string };

interface LineButton {
  key: string;
  price: number;
  color: string;
  buttons: { label: string; title: string; action: () => LineAction | null }[];
}

/** How far from the line a new TP/SL starts, before it is dragged into place. */
const NEW_LEVEL_PX = 60;

interface Props {
  api: ChartApi;
  state: TradingState;
  /** Current bid and ask, where a new TP/SL on an open position is measured from. */
  bid: number;
  ask: number;
  spec: SymbolSpec;
  /** Fixed SL/TP distances; a new level is placed this far from entry when set. */
  bracket: Bracket;
  tfSeconds: number;
  /** Time of the last revealed bar; markers after it are hidden. */
  now: number;
  /** Called when a dragged line is dropped; return false to snap it back. */
  onDrag: (target: DragTarget, price: number) => boolean;
  onAction: (action: LineAction) => void;
}

const GRAB_PX = 6;

/** Shows open positions, SL/TP and pending orders as price lines, and fills as markers. */
export function TradeLines({ api, state, bid, ask, spec, bracket, tfSeconds, now, onDrag, onAction }: Props) {
  const lines = useRef<IPriceLine[]>([]);
  const draggable = useRef<{ line: IPriceLine; target: DragTarget; price: number }[]>([]);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    markers.current = createSeriesMarkers(api.series, []);
    return () => {
      try {
        markers.current?.detach();
      } catch {
        // Chart already removed.
      }
      markers.current = null;
    };
  }, [api]);

  useEffect(() => {
    for (const l of lines.current) api.series.removePriceLine(l);
    const add = (price: number, color: string, title: string, lineStyle = LineStyle.Dashed) =>
      api.series.createPriceLine({ price, color, title, lineStyle, lineWidth: 1, axisLabelVisible: true });

    const next: IPriceLine[] = [];
    const drag: typeof draggable.current = [];
    const dragLine = (price: number, color: string, title: string, target: DragTarget, style?: LineStyle) => {
      const line = add(price, color, title, style);
      next.push(line);
      drag.push({ line, target, price });
    };
    for (const p of state.positions) {
      next.push(add(p.entryPrice, p.side === 'buy' ? BUY : SELL, `${p.side.toUpperCase()} ${p.lots.toFixed(2)}`, LineStyle.Solid));
      if (p.sl !== null) dragLine(p.sl, SELL, 'SL', { kind: 'position', id: p.id, field: 'sl' });
      if (p.tp !== null) dragLine(p.tp, '#26a69a', 'TP', { kind: 'position', id: p.id, field: 'tp' });
    }
    for (const o of state.orders) {
      const title = `${o.side.toUpperCase()} ${o.type.toUpperCase()} ${o.lots.toFixed(2)}`;
      dragLine(o.price, o.side === 'buy' ? BUY : SELL, title, { kind: 'order', id: o.id, field: 'price' }, LineStyle.Dotted);
      if (o.sl !== null) dragLine(o.sl, SELL, 'SL', { kind: 'order', id: o.id, field: 'sl' });
      if (o.tp !== null) dragLine(o.tp, '#26a69a', 'TP', { kind: 'order', id: o.id, field: 'tp' });
    }
    lines.current = next;
    draggable.current = drag;
  }, [api, state.positions, state.orders]);

  // Drag SL/TP and pending-order lines, like MT5. Listeners sit on the chart element in the
  // capture phase so a grab on a line doesn't also pan the chart.
  useEffect(() => {
    const el = api.chart.chartElement();
    let active: { line: IPriceLine; target: DragTarget; price: number } | null = null;

    const hit = (e: PointerEvent) => {
      const y = e.clientY - el.getBoundingClientRect().top;
      let best: (typeof draggable.current)[number] | null = null;
      let bestDist = GRAB_PX;
      for (const d of draggable.current) {
        const ly = api.series.priceToCoordinate(d.price);
        if (ly !== null && Math.abs(ly - y) <= bestDist) {
          best = d;
          bestDist = Math.abs(ly - y);
        }
      }
      return best;
    };
    const priceAt = (e: PointerEvent) => api.series.coordinateToPrice(e.clientY - el.getBoundingClientRect().top);

    const down = (e: PointerEvent) => {
      const d = hit(e);
      if (!d) return;
      e.stopPropagation();
      e.preventDefault();
      active = d;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (active) {
        e.stopPropagation();
        const price = priceAt(e);
        if (price !== null) active.line.applyOptions({ price });
        return;
      }
      el.style.cursor = hit(e) ? 'ns-resize' : '';
    };
    const up = (e: PointerEvent) => {
      if (!active) return;
      e.stopPropagation();
      const d = active;
      active = null;
      const price = priceAt(e);
      if (price === null || !onDragRef.current(d.target, price)) d.line.applyOptions({ price: d.price });
    };
    // Stop touch gestures from scrolling the chart while a line is held.
    const touch = (e: TouchEvent) => {
      if (active) e.stopPropagation();
    };

    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('touchstart', touch, true);
    el.addEventListener('touchmove', touch, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('touchstart', touch, true);
      el.removeEventListener('touchmove', touch, true);
    };
  }, [api]);

  useEffect(() => {
    const bucket = (t: number) => (t - (t % tfSeconds)) as UTCTimestamp;
    const list: SeriesMarker<Time>[] = [];
    for (const p of [...state.history, ...state.positions]) {
      if (p.entryTime > now) continue;
      list.push({
        time: bucket(p.entryTime),
        position: p.side === 'buy' ? 'belowBar' : 'aboveBar',
        shape: p.side === 'buy' ? 'arrowUp' : 'arrowDown',
        color: p.side === 'buy' ? BUY : SELL,
        text: `${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.lots.toFixed(2)}`,
      });
    }
    for (const t of state.history) {
      if (t.exitTime > now) continue;
      list.push({
        time: bucket(t.exitTime),
        position: 'atPriceMiddle',
        price: t.exitPrice,
        shape: 'circle',
        color: t.pnl >= 0 ? '#26a69a' : SELL,
        text: `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}`,
      });
    }
    list.sort((a, b) => (a.time as number) - (b.time as number));
    markers.current?.setMarkers(list);
  }, [state.history, state.positions, tfSeconds, now]);

  // Small buttons on each line: add a TP/SL (then drag it), remove a TP/SL, close or cancel.
  const newLevel = (from: number, side: 'buy' | 'sell', field: 'sl' | 'tp') => {
    const y = api.series.priceToCoordinate(from);
    if (y === null) return null;
    const up = (side === 'buy') === (field === 'tp');
    return api.series.coordinateToPrice(y + (up ? -NEW_LEVEL_PX : NEW_LEVEL_PX));
  };
  const buttons: LineButton[] = [];
  const levelButtons = (
    target: Omit<DragTarget, 'field'>,
    side: 'buy' | 'sell',
    entry: number,
    from: number,
    sl: number | null,
    tp: number | null,
  ) => {
    const add = (field: 'sl' | 'tp') => () => {
      const nearby = newLevel(from, side, field);
      const pips = field === 'sl' ? bracket.slPips : bracket.tpPips;
      if (pips) {
        const price = levelAt(spec, side, entry, field, pips);
        return { type: 'add' as const, target: { ...target, field }, price, fallback: nearby ?? undefined };
      }
      return nearby === null ? null : { type: 'add' as const, target: { ...target, field }, price: nearby };
    };
    const hint = (field: 'sl' | 'tp') => {
      const pips = field === 'sl' ? bracket.slPips : bracket.tpPips;
      return pips ? `${pips} pips from entry` : 'then drag it into place';
    };
    const list = [];
    if (tp === null) list.push({ label: 'TP', title: `Add take profit ${hint('tp')}`, action: add('tp') });
    if (sl === null) list.push({ label: 'SL', title: `Add stop loss ${hint('sl')}`, action: add('sl') });
    return list;
  };
  const removeButton = (target: DragTarget) => ({
    label: '✕',
    title: `Remove ${target.field.toUpperCase()}`,
    action: () => ({ type: 'remove' as const, target }),
  });
  for (const p of state.positions) {
    const target = { kind: 'position' as const, id: p.id };
    buttons.push({
      key: p.id,
      price: p.entryPrice,
      color: p.side === 'buy' ? BUY : SELL,
      buttons: [
        ...levelButtons(target, p.side, p.entryPrice, p.side === 'buy' ? bid : ask, p.sl, p.tp),
        { label: '✕', title: 'Close position', action: () => ({ type: 'close', id: p.id }) },
      ],
    });
    if (p.sl !== null) buttons.push({ key: `${p.id}:sl`, price: p.sl, color: SELL, buttons: [removeButton({ ...target, field: 'sl' })] });
    if (p.tp !== null) buttons.push({ key: `${p.id}:tp`, price: p.tp, color: '#26a69a', buttons: [removeButton({ ...target, field: 'tp' })] });
  }
  for (const o of state.orders) {
    const target = { kind: 'order' as const, id: o.id };
    buttons.push({
      key: o.id,
      price: o.price,
      color: o.side === 'buy' ? BUY : SELL,
      buttons: [
        ...levelButtons(target, o.side, o.price, o.price, o.sl, o.tp),
        { label: '✕', title: 'Cancel order', action: () => ({ type: 'cancel', id: o.id }) },
      ],
    });
    if (o.sl !== null) buttons.push({ key: `${o.id}:sl`, price: o.sl, color: SELL, buttons: [removeButton({ ...target, field: 'sl' })] });
    if (o.tp !== null) buttons.push({ key: `${o.id}:tp`, price: o.tp, color: '#26a69a', buttons: [removeButton({ ...target, field: 'tp' })] });
  }

  // Price-to-pixel mapping changes with every pan, zoom and autoscale, so follow it each frame.
  const [, setFrame] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const sig = [api.series.priceToCoordinate(1), api.series.priceToCoordinate(2), api.chart.panes()[0]?.getHeight()].join();
      if (sig !== last) {
        last = sig;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api]);

  useEffect(
    () => () => {
      for (const l of lines.current) {
        try {
          api.series.removePriceLine(l);
        } catch {
          // Chart already removed.
        }
      }
    },
    [api],
  );

  const paneHeight = api.chart.panes()[0]?.getHeight() ?? 0;
  return (
    <div className="line-buttons">
      {buttons.map((b) => {
        const y = api.series.priceToCoordinate(b.price);
        if (y === null || y < 0 || y > paneHeight) return null;
        return (
          <div key={b.key} className="line-btns" style={{ top: y, borderColor: b.color }}>
            {b.buttons.map((btn) => (
              <button
                key={btn.label + btn.title}
                title={btn.title}
                style={{ color: b.color }}
                onClick={() => {
                  const action = btn.action();
                  if (action) onAction(action);
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

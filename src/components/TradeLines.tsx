import { useEffect, useRef } from 'react';
import {
  createSeriesMarkers,
  LineStyle,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { TradingState } from '../trading/engine';
import type { ChartApi } from './ReplayChart';

const BUY = '#2962ff';
const SELL = '#ef5350';

interface Props {
  api: ChartApi;
  state: TradingState;
  tfSeconds: number;
  /** Time of the last revealed bar; markers after it are hidden. */
  now: number;
}

/** Shows open positions, SL/TP and pending orders as price lines, and fills as markers. */
export function TradeLines({ api, state, tfSeconds, now }: Props) {
  const lines = useRef<IPriceLine[]>([]);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    markers.current = createSeriesMarkers(api.series, []);
    return () => {
      markers.current?.detach();
      markers.current = null;
    };
  }, [api]);

  useEffect(() => {
    for (const l of lines.current) api.series.removePriceLine(l);
    const add = (price: number, color: string, title: string, lineStyle = LineStyle.Dashed) =>
      api.series.createPriceLine({ price, color, title, lineStyle, lineWidth: 1, axisLabelVisible: true });

    const next: IPriceLine[] = [];
    for (const p of state.positions) {
      next.push(add(p.entryPrice, p.side === 'buy' ? BUY : SELL, `${p.side.toUpperCase()} ${p.lots.toFixed(2)}`, LineStyle.Solid));
      if (p.sl !== null) next.push(add(p.sl, SELL, 'SL'));
      if (p.tp !== null) next.push(add(p.tp, '#26a69a', 'TP'));
    }
    for (const o of state.orders) {
      next.push(add(o.price, o.side === 'buy' ? BUY : SELL, `${o.side.toUpperCase()} ${o.type.toUpperCase()} ${o.lots.toFixed(2)}`, LineStyle.Dotted));
    }
    lines.current = next;
  }, [api, state.positions, state.orders]);

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

  return null;
}

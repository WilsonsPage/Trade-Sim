import { useEffect, useRef } from 'react';
import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitive, Logical } from 'lightweight-charts';
import { tradingHourSpans } from '../hours/tradingHours';
import type { ReplayView } from '../replay/useReplay';
import type { ChartApi } from './ReplayChart';

const FILL = 'rgba(38, 166, 154, 0.15)';

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

/** Draws the shaded spans behind the candles. */
class TradingHoursPrimitive implements ISeriesPrimitive {
  private spans: [number, number][] = [];
  /** Pixel left and right of each visible span, worked out when the view changes. */
  private xs: [number, number][] = [];
  private requestUpdate: (() => void) | null = null;
  private readonly view: IPrimitivePaneView;

  constructor(private readonly api: ChartApi) {
    const renderer: IPrimitivePaneRenderer = { draw: () => {}, drawBackground: (target: Target) => this.draw(target) };
    this.view = { renderer: () => renderer };
  }

  attached({ requestUpdate }: { requestUpdate: () => void }) {
    this.requestUpdate = requestUpdate;
  }

  detached() {
    this.requestUpdate = null;
  }

  paneViews() {
    return [this.view];
  }

  setSpans(spans: [number, number][]) {
    this.spans = spans;
    this.requestUpdate?.();
  }

  updateAllViews() {
    const ts = this.api.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    this.xs = [];
    if (!range) return;
    // logicalToCoordinate only handles whole bar numbers, so place fractions between bars.
    const origin = ts.logicalToCoordinate(0 as Logical);
    const next = ts.logicalToCoordinate(1 as Logical);
    if (origin === null || next === null) return;
    const toX = (logical: number) => origin + logical * (next - origin);
    for (const [a, b] of this.spans) {
      if (b < range.from - 1 || a > range.to + 1) continue;
      this.xs.push([toX(a), toX(b)]);
    }
  }

  private draw(target: Target) {
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: r }) => {
      context.fillStyle = FILL;
      for (const [x1, x2] of this.xs) {
        const left = Math.round(x1 * r);
        context.fillRect(left, 0, Math.max(1, Math.round(x2 * r) - left), bitmapSize.height);
      }
    });
  }
}

interface Props {
  api: ChartApi;
  view: ReplayView;
  tfSeconds: number;
}

/** Shades 08:00–20:00 UK time on each day of the chart. Visual only. */
export function TradingHoursLayer({ api, view, tfSeconds }: Props) {
  const primitive = useRef<TradingHoursPrimitive | null>(null);

  useEffect(() => {
    const p = new TradingHoursPrimitive(api);
    api.series.attachPrimitive(p);
    primitive.current = p;
    return () => {
      api.series.detachPrimitive(p);
      primitive.current = null;
    };
  }, [api]);

  // The chart shows the revealed bars plus the one forming now.
  // Spans only move when a bar is added, not on every tick of the forming one.
  const shown = Math.min(view.bars.length, view.revealed + 1);
  useEffect(() => {
    primitive.current?.setSpans(tradingHourSpans(view.bars, tfSeconds, shown));
  }, [api, view.bars, shown, tfSeconds]);

  return null;
}

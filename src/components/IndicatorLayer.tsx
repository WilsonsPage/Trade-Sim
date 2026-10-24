import { useEffect, useRef } from 'react';
import { LineSeries, type ISeriesApi, type LineData, type UTCTimestamp, type WhitespaceData } from 'lightweight-charts';
import type { IndicatorDef } from '../indicators/presets';
import { runScript, type Plot } from '../indicators/runScript';
import type { ReplayView } from '../replay/useReplay';
import type { ChartApi } from './ReplayChart';

/** Indicators only look at this many recent bars, which keeps fast replay smooth. */
const WINDOW = 20_000;

interface Props {
  api: ChartApi;
  view: ReplayView;
  defs: IndicatorDef[];
  onErrors: (errors: Record<string, string>) => void;
}

type Point = LineData | WhitespaceData;

/** Runs the enabled indicator scripts on the revealed bars and draws their plots. */
export function IndicatorLayer({ api, view, defs, onErrors }: Props) {
  const state = useRef<{ structure: string; revealed: number; series: ISeriesApi<'Line'>[] }>({
    structure: '',
    revealed: -1,
    series: [],
  });
  const lastErrors = useRef('{}');

  useEffect(() => {
    const { bars, revealed, current, key } = view;
    const visible = [...bars.slice(Math.max(0, revealed - WINDOW), revealed), current];

    const errors: Record<string, string> = {};
    const results: { def: IndicatorDef; plots: Plot[] }[] = [];
    for (const def of defs.filter((d) => d.enabled)) {
      try {
        results.push({ def, plots: runScript(def.code, visible) });
      } catch (e) {
        errors[def.id] = (e as Error).message;
      }
    }
    const errJson = JSON.stringify(errors);
    if (errJson !== lastErrors.current) {
      lastErrors.current = errJson;
      onErrors(errors);
    }

    const toPoints = (values: number[]): Point[] =>
      visible.map((b, i) => {
        const v = values[i];
        const time = b.time as UTCTimestamp;
        return Number.isFinite(v) ? { time, value: v } : { time };
      });

    const flat = results.flatMap((r) => r.plots.map((p) => ({ def: r.def, plot: p })));
    const structure = [
      key,
      ...results.map(({ def }) => `${def.id}:${def.code}`),
      ...flat.map(({ def, plot }) => `${def.id}:${plot.options.pane}:${plot.options.color}:${plot.options.lineWidth}`),
    ].join('|');
    const s = state.current;

    if (structure !== s.structure) {
      for (const series of s.series) api.chart.removeSeries(series);
      while (api.chart.panes().length > 1) api.chart.removePane(api.chart.panes().length - 1);
      // Each indicator with 'new' plots gets its own pane under the price chart.
      const paneOf = new Map<string, number>();
      for (const { def, plot } of flat) {
        if (plot.options.pane === 'new' && !paneOf.has(def.id)) paneOf.set(def.id, paneOf.size + 1);
      }
      s.series = flat.map(({ def, plot }) =>
        api.chart.addSeries(
          LineSeries,
          {
            color: plot.options.color,
            lineWidth: plot.options.lineWidth as 1 | 2 | 3 | 4,
            title: plot.options.title,
            priceLineVisible: false,
            lastValueVisible: plot.options.title !== '',
            crosshairMarkerVisible: false,
          },
          plot.options.pane === 'new' ? paneOf.get(def.id) : 0,
        ),
      );
      api.chart.panes().forEach((pane, i) => i > 0 && pane.setHeight(120));
      s.structure = structure;
      s.revealed = -1;
    }

    const step = revealed - s.revealed;
    flat.forEach(({ plot }, i) => {
      const points = toPoints(plot.values);
      if (step === 0 || step === 1) {
        for (const p of points.slice(-1 - step)) s.series[i].update(p);
      } else {
        s.series[i].setData(points);
      }
    });
    s.revealed = revealed;
  }, [api, view, defs, onErrors]);

  useEffect(
    () => () => {
      for (const series of state.current.series) {
        try {
          api.chart.removeSeries(series);
        } catch {
          // Chart already removed.
        }
      }
      state.current = { structure: '', revealed: -1, series: [] };
    },
    [api],
  );

  return null;
}

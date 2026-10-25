import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar } from '../types';
import type { ReplayView } from '../replay/useReplay';

const toCandle = (b: Bar): CandlestickData => ({ ...b, time: b.time as UTCTimestamp });

export interface ChartApi {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
}

interface Props {
  view: ReplayView;
  digits: number;
  /** Layers (drawings, indicators) that need the chart once it exists. */
  children?: (api: ChartApi) => ReactNode;
}

export function ReplayChart({ view, digits, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [api, setApi] = useState<ChartApi | null>(null);
  const drawn = useRef<{ key: string; revealed: number }>({ key: '', revealed: -1 });

  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#b2b5be' },
      grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 10 },
      crosshair: { mode: 0 },
    });
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    chartRef.current = chart;
    setApi({ chart, series: seriesRef.current });
    // Lets browser tests map prices to pixels; stripped from production builds.
    if (import.meta.env.DEV) Object.assign(window, { __chart: { chart, series: seriesRef.current } });
    return () => {
      setApi(null);
      // Layers clean up their series and lines in their own effects, which can run after
      // this one; removing the chart a tick later keeps them from touching a disposed chart.
      setTimeout(() => chart.remove());
      chartRef.current = null;
      seriesRef.current = null;
      drawn.current = { key: '', revealed: -1 };
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
    });
  }, [digits]);

  // Append or update only the bars that changed; redraw everything on bigger jumps.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const prev = drawn.current;
    const { bars, revealed, current, key } = view;
    if (prev.key === key && revealed === prev.revealed) {
      series.update(toCandle(current));
    } else if (prev.key === key && revealed > prev.revealed && revealed - prev.revealed <= 500) {
      for (let i = prev.revealed; i < revealed; i++) series.update(toCandle(bars[i]));
      series.update(toCandle(current));
    } else {
      series.setData([...bars.slice(0, revealed).map(toCandle), toCandle(current)]);
      if (prev.key !== key) chartRef.current?.timeScale().scrollToRealTime();
    }
    drawn.current = { key, revealed };
  }, [view]);

  return (
    <div className="chart">
      <div ref={containerRef} className="chart-canvas" />
      {api && children?.(api)}
    </div>
  );
}

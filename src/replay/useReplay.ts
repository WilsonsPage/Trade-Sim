import { useCallback, useEffect, useMemo, useState } from 'react';
import { aggregate, bucketOf, indexAtTime, partialBar, type Aggregated } from '../data/aggregate';
import type { Bar, Dataset } from '../types';

export const SPEEDS = [1, 2, 5, 10, 20];

export interface ReplayView {
  /** All aggregated bars for the chosen timeframe, including ones not revealed yet. */
  bars: Bar[];
  /** Number of fully revealed bars before the current one. */
  revealed: number;
  /** The current (rightmost) bar, which may still be forming. */
  current: Bar;
  /** Changes whenever the chart must be redrawn from scratch. */
  key: string;
}

function viewAt(dataset: Dataset, agg: Aggregated, pos: number, key: string): ReplayView {
  const k = bucketOf(agg, pos);
  return { bars: agg.bars, revealed: k, current: partialBar(dataset.bars, agg, k, pos), key };
}

/**
 * Replays `dataset` bar by bar. The position is tracked on the raw (M1) bars, so the
 * timeframe can be switched mid-replay and the trading engine can fill orders minute
 * by minute inside each chart bar.
 */
export function useReplay(dataset: Dataset, tfSeconds: number, startTime: number, initialPos?: number) {
  const agg = useMemo(() => aggregate(dataset.bars, tfSeconds), [dataset, tfSeconds]);
  const [pos, setPos] = useState(() =>
    Math.min(initialPos ?? Math.max(0, indexAtTime(dataset.bars, startTime) - 1), dataset.bars.length - 1),
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  const atEnd = pos >= dataset.bars.length - 1;

  const step = useCallback(() => {
    setPos((p) => {
      const k = bucketOf(agg, p);
      if (p < agg.endIdx[k]) return agg.endIdx[k];
      return k + 1 < agg.endIdx.length ? agg.endIdx[k + 1] : p;
    });
  }, [agg]);

  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const id = setInterval(step, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, step, atEnd]);

  const view = useMemo(
    () => viewAt(dataset, agg, pos, `${dataset.symbol}:${tfSeconds}:${startTime}`),
    [agg, dataset, pos, tfSeconds, startTime],
  );

  return {
    view,
    /** Index of the last revealed raw bar. */
    pos,
    time: dataset.bars[pos].time,
    price: dataset.bars[pos].close,
    atEnd,
    playing,
    speed,
    setSpeed,
    step,
    togglePlay: () => setPlaying((p) => !p && !atEnd),
    /** Jumps to raw bar `p` and pauses. */
    seek: (p: number) => {
      setPlaying(false);
      setPos(Math.max(0, Math.min(p, dataset.bars.length - 1)));
    },
  };
}

/**
 * Shows `dataset` up to `time`, for a second chart that follows the main replay. Returns
 * null while `dataset` has no bars at or before `time`.
 */
export function useFollowReplay(dataset: Dataset | null, tfSeconds: number, time: number, startTime: number) {
  const agg = useMemo(() => dataset && aggregate(dataset.bars, tfSeconds), [dataset, tfSeconds]);
  const pos = useMemo(() => (dataset ? lastIndexAtOrBefore(dataset.bars, time) : -1), [dataset, time]);
  const view = useMemo(
    () => (dataset && agg && pos >= 0 ? viewAt(dataset, agg, pos, `${dataset.symbol}:${tfSeconds}:${startTime}`) : null),
    [dataset, agg, pos, tfSeconds, startTime],
  );
  return { view, price: dataset && pos >= 0 ? dataset.bars[pos].close : null };
}

/** Index of the last bar that opened at or before `time`, or -1 if there is none. */
export function lastIndexAtOrBefore(bars: Bar[], time: number): number {
  const i = indexAtTime(bars, time + 1);
  return bars[i].time <= time ? i : i - 1;
}

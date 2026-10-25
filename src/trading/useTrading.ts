import { useEffect, useRef, useState } from 'react';
import type { SymbolSpec } from '../data/symbols';
import type { Dataset } from '../types';
import * as engine from './engine';
import type { PendingOrder, Position, Side } from './engine';

/** How many replay steps can be undone. */
const MAX_REWIND = 5000;

/** Runs the trading engine alongside the replay, minute by minute. */
export function useTrading(
  dataset: Dataset,
  spec: SymbolSpec,
  pos: number,
  costs: { startBalance: number; spread: number; commission: number },
  initial?: engine.TradingState,
) {
  const [state, setState] = useState(
    () =>
      initial ??
      engine.initialState(costs.startBalance, dataset.bars[pos].time, costs.spread, costs.commission),
  );
  const processed = useRef(pos);
  const latest = useRef(state);
  latest.current = state;
  // Account snapshots from before each replay step, so steps can be rewound exactly.
  const timeline = useRef<{ pos: number; state: engine.TradingState }[]>([]);
  const [rewindable, setRewindable] = useState(0);

  useEffect(() => {
    const from = processed.current;
    if (pos <= from) {
      processed.current = pos;
      return;
    }
    processed.current = pos;
    timeline.current.push({ pos: from, state: latest.current });
    if (timeline.current.length > MAX_REWIND) timeline.current.shift();
    setRewindable(timeline.current.length);
    setState((s) => {
      for (let i = from + 1; i <= pos; i++) s = engine.processBar(s, spec, dataset.bars[i]);
      return s;
    });
  }, [pos, dataset, spec]);

  const bar = dataset.bars[pos];
  const price = bar.close;
  const floating = engine.floatingPnl(state, spec, price);

  return {
    state,
    price,
    floating,
    equity: state.balance + floating,
    /** Bid and ask at the current bar. */
    ask: price + (state.spread ?? 0),
    marketOrder: (side: Side, lots: number, sl: number | null, tp: number | null) =>
      setState((s) => engine.openPosition(s, { side, lots, sl, tp }, engine.entryPrice(s, side, price), bar.time)),
    pendingOrder: (order: Omit<PendingOrder, 'id' | 'placedAt'>) =>
      setState((s) => engine.placeOrder(s, { ...order, placedAt: bar.time })),
    cancelOrder: (id: string) => setState((s) => engine.cancelOrder(s, id)),
    close: (id: string) =>
      setState((s) => {
        const p = s.positions.find((x) => x.id === id);
        return p ? engine.closePosition(s, spec, id, engine.exitPrice(s, p.side, price), bar.time, 'manual') : s;
      }),
    closeAll: () =>
      setState((s) =>
        s.positions.reduce(
          (acc: engine.TradingState, p: Position) =>
            engine.closePosition(acc, spec, p.id, engine.exitPrice(acc, p.side, price), bar.time, 'manual'),
          s,
        ),
      ),
    positionPnl: (p: Position) => engine.positionPnl(state, spec, p, price),
    /** Closes every position at the current price and cancels pending orders. */
    end: () => {
      const ended = engine.endSession(state, spec, price, bar.time);
      setState(ended);
      return ended;
    },
    modifyOrder: (id: string, fields: Partial<Pick<PendingOrder, 'price' | 'sl' | 'tp'>>) =>
      setState((s) => engine.modifyOrder(s, id, fields)),
    modify: (id: string, sl: number | null, tp: number | null) => setState((s) => engine.modifyPosition(s, id, sl, tp)),
    setAutoBreakeven: (r: number | null) => setState((s) => ({ ...s, autoBreakevenR: r })),
    /** Steps that can be undone. */
    rewindable,
    /**
     * Restores the account to before the last replay step and returns the replay position
     * to go back to, or null if there is nothing to rewind.
     */
    rewind: (): number | null => {
      const last = timeline.current.pop();
      if (!last) return null;
      setRewindable(timeline.current.length);
      processed.current = last.pos;
      // Keep the auto-breakeven setting as it is now.
      setState((s) => ({ ...last.state, autoBreakevenR: s.autoBreakevenR }));
      return last.pos;
    },
  };
}

export type Trading = ReturnType<typeof useTrading>;

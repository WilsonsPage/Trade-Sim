import { useEffect, useState } from 'react';
import type { PendingType, Side } from '../trading/engine';
import type { ChartApi } from './ReplayChart';

const LOTS_KEY = 'trade-sim:menu-lots';
const LONG_PRESS_MS = 500;

interface Props {
  api: ChartApi;
  digits: number;
  bid: number;
  ask: number;
  onPlace: (side: Side, type: PendingType, price: number, lots: number) => void;
}

interface Menu {
  x: number;
  y: number;
  price: number;
}

const MENU_W = 180;
const MENU_H = 150;

function loadLots() {
  try {
    return localStorage.getItem(LOTS_KEY) ?? '0.10';
  } catch {
    return '0.10';
  }
}

/**
 * Right-click (or long-press on touch screens) the chart to place a pending order at that
 * price. The order then shows as a line that can be dragged and given a TP/SL.
 */
export function ChartOrderMenu({ api, digits, bid, ask, onPlace }: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [lots, setLots] = useState(loadLots);

  useEffect(() => {
    const chartEl = api.chart.chartElement();
    const box = chartEl.closest('.chart') as HTMLElement;
    const open = (clientX: number, clientY: number) => {
      const rect = chartEl.getBoundingClientRect();
      const price = api.series.coordinateToPrice(clientY - rect.top);
      // Only over the price pane, not the price axis or indicator panes.
      const paneHeight = api.chart.panes()[0]?.getHeight() ?? 0;
      if (price === null || clientY - rect.top > paneHeight || clientX - rect.left > api.chart.timeScale().width()) return;
      const outer = box.getBoundingClientRect();
      // Keep the menu inside the chart.
      const x = Math.max(4, Math.min(clientX - outer.left, outer.width - MENU_W - 4));
      const y = Math.max(4, Math.min(clientY - outer.top, outer.height - MENU_H - 4));
      setMenu({ x, y, price: Number(price.toFixed(digits)) });
    };

    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      open(e.clientX, e.clientY);
    };

    // iOS Safari has no contextmenu event for touch, so detect a long press by hand.
    let press: { id: number; x: number; y: number; timer: number } | null = null;
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      cancel();
      const { clientX: x, clientY: y } = e;
      press = { id: e.pointerId, x, y, timer: window.setTimeout(() => open(x, y), LONG_PRESS_MS) };
    };
    const move = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancel();
    };

    box.addEventListener('contextmenu', onContext);
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', cancel);
    box.addEventListener('pointercancel', cancel);
    return () => {
      cancel();
      box.removeEventListener('contextmenu', onContext);
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', cancel);
      box.removeEventListener('pointercancel', cancel);
    };
  }, [api, digits]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  if (!menu) return null;

  const lotsN = Number(lots);
  const place = (side: Side, type: PendingType) => {
    try {
      localStorage.setItem(LOTS_KEY, lots);
    } catch {
      // Not remembered.
    }
    onPlace(side, type, menu.price, lotsN);
    setMenu(null);
  };
  // Below the market: buy limit / sell stop. Above: sell limit / buy stop.
  const options: { side: Side; type: PendingType }[] =
    menu.price < bid
      ? [
          { side: 'buy', type: 'limit' },
          { side: 'sell', type: 'stop' },
        ]
      : menu.price > ask
        ? [
            { side: 'sell', type: 'limit' },
            { side: 'buy', type: 'stop' },
          ]
        : [];

  return (
    <>
      <div className="menu-backdrop" onPointerDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="order-menu"
        style={{ left: menu.x, top: menu.y, width: MENU_W }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="muted small">Pending order at {menu.price.toFixed(digits)}</div>
        {options.length === 0 && <div className="small">Too close to the current price. Use market buy/sell.</div>}
        {options.map((o) => (
          <button key={o.side + o.type} className={o.side === 'buy' ? 'buy-item' : 'sell-item'} disabled={!(lotsN >= 0.01)} onClick={() => place(o.side, o.type)}>
            {o.side === 'buy' ? 'Buy' : 'Sell'} {o.type === 'limit' ? 'Limit' : 'Stop'} {lotsN >= 0.01 ? lotsN.toFixed(2) : ''}
          </button>
        ))}
        {options.length > 0 && (
          <label className="field">
            Lots
            <input type="number" min="0.01" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} />
          </label>
        )}
      </div>
    </>
  );
}

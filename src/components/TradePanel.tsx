import { useState } from 'react';
import type { SymbolSpec } from '../data/symbols';
import { pnlUsd, type PendingType, type Position, type Side } from '../trading/engine';
import type { Trading } from '../trading/useTrading';

type OrderKind = 'market' | `${Side}-${PendingType}`;

const KINDS: { value: OrderKind; label: string }[] = [
  { value: 'market', label: 'Market execution' },
  { value: 'buy-limit', label: 'Buy Limit' },
  { value: 'sell-limit', label: 'Sell Limit' },
  { value: 'buy-stop', label: 'Buy Stop' },
  { value: 'sell-stop', label: 'Sell Stop' },
];

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const fmtTime = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ');

/** Checks SL/TP sit on the right side of the entry for the trade direction. */
function levelError(side: Side, entry: number, sl: number | null, tp: number | null): string | null {
  const d = side === 'buy' ? 1 : -1;
  if (sl !== null && (Number.isNaN(sl) || (entry - sl) * d <= 0)) return `Stop loss must be ${side === 'buy' ? 'below' : 'above'} the entry`;
  if (tp !== null && (Number.isNaN(tp) || (tp - entry) * d <= 0)) return `Take profit must be ${side === 'buy' ? 'above' : 'below'} the entry`;
  return null;
}

function PositionRow({ p, trading, spec }: { p: Position; trading: Trading; spec: SymbolSpec }) {
  const [open, setOpen] = useState(false);
  const [sl, setSl] = useState(p.sl?.toString() ?? '');
  const [tp, setTp] = useState(p.tp?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const pnl = pnlUsd(spec, p.side, p.lots, p.entryPrice, trading.price);

  const save = () => {
    const err = levelError(p.side, trading.price, num(sl), num(tp));
    setError(err);
    if (!err) {
      trading.modify(p.id, num(sl), num(tp));
      setOpen(false);
    }
  };

  return (
    <div className="trade-row">
      <div className="row" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div className="grow">
          <div>
            <strong>{spec.symbol}</strong>, <span className={p.side}>{p.side} {p.lots.toFixed(2)}</span>
          </div>
          <div className="muted small">
            {p.entryPrice.toFixed(spec.digits)} → {trading.price.toFixed(spec.digits)}
          </div>
        </div>
        <strong className={pnl >= 0 ? 'profit' : 'loss'}>{money(pnl)}</strong>
      </div>
      {open && (
        <div className="trade-edit">
          <div className="muted small">Opened {fmtTime(p.entryTime)}</div>
          <div className="row">
            <label className="field">
              S/L
              <input inputMode="decimal" value={sl} placeholder="none" onChange={(e) => setSl(e.target.value)} />
            </label>
            <label className="field">
              T/P
              <input inputMode="decimal" value={tp} placeholder="none" onChange={(e) => setTp(e.target.value)} />
            </label>
          </div>
          {error && <div className="error small">{error}</div>}
          <div className="row">
            <button onClick={save}>Modify</button>
            <button className="close-btn" onClick={() => trading.close(p.id)}>
              Close {money(pnl)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TradePanel({ trading, spec }: { trading: Trading; spec: SymbolSpec }) {
  const [tab, setTab] = useState<'trade' | 'history'>('trade');
  const [kind, setKind] = useState<OrderKind>('market');
  const [lots, setLots] = useState('0.10');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { state } = trading;

  const lotsN = Number(lots);
  const entry = kind === 'market' ? trading.price : Number(price) || trading.price;
  const riskSide: Side = kind === 'market' ? 'buy' : (kind.split('-')[0] as Side);
  const slN = num(sl);
  const tpN = num(tp);
  const risk = slN !== null && lotsN > 0 ? Math.abs(pnlUsd(spec, riskSide, lotsN, entry, slN)) : null;
  const reward = tpN !== null && lotsN > 0 ? Math.abs(pnlUsd(spec, riskSide, lotsN, entry, tpN)) : null;

  const submit = (side: Side) => {
    if (!(lotsN >= 0.01)) return setError('Volume must be at least 0.01 lots');
    if (kind === 'market') {
      const err = levelError(side, trading.price, slN, tpN);
      if (err) return setError(err);
      trading.marketOrder(side, lotsN, slN, tpN);
    } else {
      const type = kind.split('-')[1] as PendingType;
      const p = Number(price);
      if (!(p > 0)) return setError('Enter the order price');
      const above = p > trading.price;
      const wantAbove = (side === 'buy') === (type === 'stop');
      if (above !== wantAbove) {
        return setError(`A ${side} ${type} must be ${wantAbove ? 'above' : 'below'} the current price`);
      }
      const err = levelError(side, p, slN, tpN);
      if (err) return setError(err);
      trading.pendingOrder({ side, type, price: p, lots: lotsN, sl: slN, tp: tpN });
    }
    setError(null);
  };

  const pendingSide = kind === 'market' ? null : (kind.split('-')[0] as Side);

  return (
    <div className="trade-panel">
      <div className="account">
        <div>
          <span className="muted">Balance</span>
          <strong>{money(state.balance)}</strong>
        </div>
        <div>
          <span className="muted">Equity</span>
          <strong>{money(trading.equity)}</strong>
        </div>
        <div>
          <span className="muted">Floating</span>
          <strong className={trading.floating >= 0 ? 'profit' : 'loss'}>{money(trading.floating)}</strong>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'trade' ? 'active' : ''} onClick={() => setTab('trade')}>
          Trade
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History ({state.history.length})
        </button>
      </div>

      {tab === 'trade' ? (
        <>
          <div className="order-form">
            <select value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <div className="row">
              <label className="field">
                Volume (lots)
                <input type="number" min="0.01" step="0.01" value={lots} onChange={(e) => setLots(e.target.value)} />
              </label>
              {kind !== 'market' && (
                <label className="field">
                  Price
                  <input
                    inputMode="decimal"
                    value={price}
                    placeholder={trading.price.toFixed(spec.digits)}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="row">
              <label className="field">
                Stop loss
                <input inputMode="decimal" value={sl} placeholder="none" onChange={(e) => setSl(e.target.value)} />
              </label>
              <label className="field">
                Take profit
                <input inputMode="decimal" value={tp} placeholder="none" onChange={(e) => setTp(e.target.value)} />
              </label>
            </div>
            {(risk !== null || reward !== null) && (
              <div className="muted small">
                {risk !== null && <>Risk {money(risk)} ({((risk / state.balance) * 100).toFixed(1)}%)</>}
                {risk !== null && reward !== null && ' · '}
                {reward !== null && <>Reward {money(reward)}</>}
                {risk && reward ? ` · R:R 1:${(reward / risk).toFixed(2)}` : ''}
              </div>
            )}
            {error && <div className="error small">{error}</div>}
            {kind === 'market' ? (
              <div className="row">
                <button className="sell-btn" onClick={() => submit('sell')}>
                  SELL
                  <small>{trading.price.toFixed(spec.digits)}</small>
                </button>
                <button className="buy-btn" onClick={() => submit('buy')}>
                  BUY
                  <small>{trading.price.toFixed(spec.digits)}</small>
                </button>
              </div>
            ) : (
              <button className={pendingSide === 'buy' ? 'buy-btn' : 'sell-btn'} onClick={() => submit(pendingSide!)}>
                Place {KINDS.find((k) => k.value === kind)!.label}
              </button>
            )}
          </div>

          <h4>
            Positions ({state.positions.length})
            {state.positions.length > 1 && (
              <button className="link" onClick={trading.closeAll}>
                Close all
              </button>
            )}
          </h4>
          {state.positions.length === 0 && <p className="muted small">No open positions.</p>}
          {state.positions.map((p) => (
            <PositionRow key={p.id} p={p} trading={trading} spec={spec} />
          ))}

          <h4>Orders ({state.orders.length})</h4>
          {state.orders.length === 0 && <p className="muted small">No pending orders.</p>}
          {state.orders.map((o) => (
            <div key={o.id} className="trade-row row">
              <div className="grow">
                <div>
                  <span className={o.side}>
                    {o.side} {o.type} {o.lots.toFixed(2)}
                  </span>{' '}
                  at {o.price.toFixed(spec.digits)}
                </div>
                <div className="muted small">
                  SL {o.sl?.toFixed(spec.digits) ?? '—'} · TP {o.tp?.toFixed(spec.digits) ?? '—'}
                </div>
              </div>
              <button onClick={() => trading.cancelOrder(o.id)} title="Cancel order">
                ✕
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          {state.history.length === 0 && <p className="muted small">No closed trades yet.</p>}
          {[...state.history].reverse().map((t) => (
            <div key={t.id} className="trade-row row">
              <div className="grow">
                <div>
                  <span className={t.side}>
                    {t.side} {t.lots.toFixed(2)}
                  </span>{' '}
                  <span className="muted small">{t.reason === 'manual' ? '' : t.reason.toUpperCase()}</span>
                </div>
                <div className="muted small">
                  {t.entryPrice.toFixed(spec.digits)} → {t.exitPrice.toFixed(spec.digits)} · {fmtTime(t.exitTime)}
                </div>
              </div>
              <strong className={t.pnl >= 0 ? 'profit' : 'loss'}>{money(t.pnl)}</strong>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

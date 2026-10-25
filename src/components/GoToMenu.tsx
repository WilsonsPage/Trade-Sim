import { useState } from 'react';
import { nextLocalTime, SESSIONS } from '../replay/goTo';

const fmt = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').slice(5, 16);

interface Props {
  /** Current replay time (UTC seconds). */
  now: number;
  /** Last time with data. */
  end: number;
  /** Jump forward so the bar at `time` is the next one to appear. */
  onGo: (time: number) => void;
}

/** Jumps the replay forward to a session open or a chosen date. Open trades are processed on the way. */
export function GoToMenu({ now, end, onGo }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const go = (t: number) => {
    onGo(t);
    setOpen(false);
  };
  const dateTime = date ? Date.parse(`${date}Z`) / 1000 : NaN;

  return (
    <span className="goto">
      <button onClick={() => setOpen(!open)} title="Jump forward to a session open or date">
        Go to ▾
      </button>
      {open && (
        <>
          <div className="menu-backdrop fixed" onPointerDown={() => setOpen(false)} />
          <div className="goto-menu">
            {SESSIONS.map((s) => {
              const t = nextLocalTime(now, s.zone, s.hour);
              return (
                <button key={s.label} disabled={t > end} onClick={() => go(t)}>
                  {s.label} <span className="muted small">{fmt(t)} UTC</span>
                </button>
              );
            })}
            <label className="field">
              Date and time (UTC)
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button disabled={!(dateTime > now && dateTime <= end)} onClick={() => go(dateTime)}>
              Go
            </button>
            <p className="muted small">Open trades and orders are processed on the way. Use ⏮ Back to undo.</p>
          </div>
        </>
      )}
    </span>
  );
}

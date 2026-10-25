import { useEffect, useState } from 'react';
import { deleteShot, loadShot, saveShot } from '../sessions/sessions';
import type { JournalFields, Position } from '../trading/engine';

const parseTags = (s: string) =>
  [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 30));

/** Shows a trade's stored screenshot; click to open it full size. */
export function Shot({ tradeId, className = 'shot-thumb' }: { tradeId: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    let live = true;
    loadShot(tradeId).then((s) => live && setSrc(s ?? null), () => {});
    return () => {
      live = false;
    };
  }, [tradeId]);
  if (!src) return null;
  return (
    <>
      <img className={className} src={src} alt="Chart when the screenshot was taken" onClick={() => setBig(true)} />
      {big && (
        <div className="dialog-backdrop" onClick={() => setBig(false)}>
          <img className="shot-full" src={src} alt="Chart screenshot" />
        </div>
      )}
    </>
  );
}

interface Props {
  trade: Position;
  /** All tags used so far in the session, offered as suggestions. */
  knownTags: string[];
  onChange: (fields: JournalFields) => void;
  /** Returns a JPEG data URL of the chart, or null if it isn't available. */
  capture: () => Promise<string | null>;
}

/** Notes, tags and a chart screenshot for one trade. */
export function JournalEditor({ trade, knownTags, onChange, capture }: Props) {
  const [note, setNote] = useState(trade.note ?? '');
  const [tags, setTags] = useState((trade.tags ?? []).join(', '));
  const [shotKey, setShotKey] = useState(0);
  const listId = `tags-${trade.id}`;

  const takeShot = async () => {
    const url = await capture();
    if (!url) return;
    await saveShot(trade.id, url).catch(() => {});
    onChange({ hasShot: true });
    setShotKey((k) => k + 1);
  };

  const removeShot = async () => {
    await deleteShot(trade.id).catch(() => {});
    onChange({ hasShot: false });
  };

  return (
    <div className="journal">
      <textarea
        className="note"
        placeholder="Notes: why you took it, what you saw, how you managed it…"
        value={note}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (trade.note ?? '') && onChange({ note })}
      />
      <input
        list={listId}
        placeholder="Tags, comma separated (e.g. breakout, A+ setup, FOMO)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={() => onChange({ tags: parseTags(tags) })}
      />
      <datalist id={listId}>
        {knownTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="row">
        <button onClick={takeShot} title="Save a picture of the chart as it is now">
          📷 {trade.hasShot ? 'Retake screenshot' : 'Screenshot chart'}
        </button>
        {trade.hasShot && (
          <button onClick={removeShot} title="Delete screenshot">
            ✕
          </button>
        )}
      </div>
      {trade.hasShot && <Shot key={shotKey} tradeId={trade.id} />}
    </div>
  );
}

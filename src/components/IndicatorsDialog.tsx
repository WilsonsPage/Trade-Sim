import { useState } from 'react';
import { PRESETS, SCRIPT_HELP, type IndicatorDef } from '../indicators/presets';

interface Props {
  title?: string;
  defs: IndicatorDef[];
  errors: Record<string, string>;
  onChange: (defs: IndicatorDef[]) => void;
  onClose: () => void;
}

export function IndicatorsDialog({ title = 'Indicators', defs, errors, onChange, onClose }: Props) {
  const [editing, setEditing] = useState<IndicatorDef | null>(null);

  const add = (preset: (typeof PRESETS)[number]) => {
    const def = { ...preset, id: crypto.randomUUID(), enabled: true };
    onChange([...defs, def]);
    if (preset.name === 'Custom') setEditing(def);
  };

  const update = (def: IndicatorDef) => onChange(defs.map((d) => (d.id === def.id ? def : d)));

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <>
            <h3>Edit indicator</h3>
            <input
              className="wide"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <textarea
              className="code"
              spellCheck={false}
              value={editing.code}
              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
            />
            <details>
              <summary className="muted">Script reference</summary>
              <pre className="muted">{SCRIPT_HELP}</pre>
            </details>
            {errors[editing.id] && <p className="error">Error: {errors[editing.id]}</p>}
            <div className="row">
              <button onClick={() => update(editing)}>Apply</button>
              <button
                className="primary-inline"
                onClick={() => {
                  update(editing);
                  setEditing(null);
                }}
              >
                Save
              </button>
              <button onClick={() => setEditing(null)}>Back</button>
            </div>
          </>
        ) : (
          <>
            <h3>{title}</h3>
            {defs.length === 0 && <p className="muted">No indicators yet. Add one below.</p>}
            {defs.map((d) => (
              <div key={d.id} className="row indicator-row">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => update({ ...d, enabled: e.target.checked })}
                />
                <span className="grow">
                  {d.name}
                  {errors[d.id] && <span className="error"> (error)</span>}
                </span>
                <button onClick={() => setEditing(d)}>Edit</button>
                <button onClick={() => onChange(defs.filter((x) => x.id !== d.id))} title="Remove">
                  ✕
                </button>
              </div>
            ))}
            <h4>Add</h4>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p.name} className="chip" onClick={() => add(p)}>
                  {p.name === 'Custom' ? '+ Custom script' : p.name}
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <span className="grow" />
              <button onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

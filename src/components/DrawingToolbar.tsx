import type { DrawingTool } from '../drawings/types';

const TOOLS: { tool: DrawingTool | null; icon: string; title: string }[] = [
  { tool: null, icon: '↖', title: 'Select / move (Esc)' },
  { tool: 'trend', icon: '╱', title: 'Trend line' },
  { tool: 'hline', icon: '─', title: 'Horizontal line' },
  { tool: 'vline', icon: '│', title: 'Vertical line' },
  { tool: 'rect', icon: '▭', title: 'Box' },
];

export const COLORS = ['#2962ff', '#f7a600', '#26a69a', '#ef5350', '#e91e63', '#d1d4dc'];

interface Props {
  tool: DrawingTool | null;
  onTool: (t: DrawingTool | null) => void;
  color: string;
  onColor: (c: string) => void;
  canDelete: boolean;
  onDelete: () => void;
  onClear: () => void;
}

export function DrawingToolbar({ tool, onTool, color, onColor, canDelete, onDelete, onClear }: Props) {
  return (
    <div className="draw-toolbar">
      {TOOLS.map((t) => (
        <button key={t.title} className={tool === t.tool ? 'active' : ''} title={t.title} onClick={() => onTool(t.tool)}>
          {t.icon}
        </button>
      ))}
      <span className="sep" />
      {COLORS.map((c) => (
        <button
          key={c}
          className={c === color ? 'swatch active' : 'swatch'}
          style={{ background: c }}
          title="Colour"
          onClick={() => onColor(c)}
        />
      ))}
      <span className="sep" />
      <button title="Delete selected (Del)" disabled={!canDelete} onClick={onDelete}>
        🗑
      </button>
      <button title="Clear all drawings" onClick={onClear}>
        ⨯
      </button>
    </div>
  );
}

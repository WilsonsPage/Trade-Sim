import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Logical } from 'lightweight-charts';
import { logicalToTime, timeToLogical } from '../drawings/timeIndex';
import { POINTS_NEEDED, type Drawing, type DrawingTool, type Point } from '../drawings/types';
import type { Bar } from '../types';
import type { ChartApi } from './ReplayChart';

interface Props {
  api: ChartApi;
  bars: Bar[];
  tfSeconds: number;
  drawings: Drawing[];
  onChange: (drawings: Drawing[]) => void;
  tool: DrawingTool | null;
  onToolDone: () => void;
  color: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

type Drag =
  | { kind: 'handle'; id: string; index: number }
  | { kind: 'move'; id: string; start: Point; original: Point[] };

/** SVG layer over the price pane that draws and edits lines and boxes. */
export function DrawingLayer(props: Props) {
  const { api, bars, tfSeconds, drawings, onChange, tool, color, selectedId, onSelect } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, setFrame] = useState(0);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  // The chart has no event for every pan/zoom/autoscale, so watch the mapping each frame
  // and re-render only when it changes.
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const ts = api.chart.timeScale();
      const width = ts.width();
      const height = api.chart.panes()[0]?.getHeight() ?? 0;
      const sig = [width, height, ts.logicalToCoordinate(0 as Logical), ts.logicalToCoordinate(100 as Logical),
        api.series.priceToCoordinate(1), api.series.priceToCoordinate(2)].join();
      if (sig !== last) {
        last = sig;
        setSize({ width, height });
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api]);

  const toXY = (p: Point) => ({
    x: api.chart.timeScale().logicalToCoordinate(timeToLogical(bars, tfSeconds, p.time) as Logical) ?? -9999,
    y: api.series.priceToCoordinate(p.price) ?? -9999,
  });

  const fromEvent = (e: { clientX: number; clientY: number }): Point | null => {
    const rect = svgRef.current!.getBoundingClientRect();
    const logical = api.chart.timeScale().coordinateToLogical(e.clientX - rect.left);
    const price = api.series.coordinateToPrice(e.clientY - rect.top);
    if (logical === null || price === null) return null;
    return { time: logicalToTime(bars, tfSeconds, logical), price };
  };

  const shift = (p: Point, from: Point, to: Point): Point => {
    const dl = timeToLogical(bars, tfSeconds, to.time) - timeToLogical(bars, tfSeconds, from.time);
    return {
      time: logicalToTime(bars, tfSeconds, timeToLogical(bars, tfSeconds, p.time) + dl),
      price: p.price + to.price - from.price,
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!tool) return;
    const p = fromEvent(e);
    if (!p) return;
    if (!draft) {
      const d: Drawing = { id: crypto.randomUUID(), type: tool, points: [p], color };
      if (POINTS_NEEDED[tool] === 1) {
        onChange([...drawings, d]);
        props.onToolDone();
        onSelect(d.id);
      } else {
        setDraft({ ...d, points: [p, p] });
      }
    } else {
      const d = { ...draft, points: [draft.points[0], p] };
      setDraft(null);
      onChange([...drawings, d]);
      props.onToolDone();
      onSelect(d.id);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = fromEvent(e);
    if (!p) return;
    if (draft) {
      setDraft({ ...draft, points: [draft.points[0], p] });
      return;
    }
    const d = drag.current;
    if (!d) return;
    onChange(
      drawings.map((dr) => {
        if (dr.id !== d.id) return dr;
        if (d.kind === 'handle') return { ...dr, points: dr.points.map((pt, i) => (i === d.index ? p : pt)) };
        return { ...dr, points: d.original.map((pt) => shift(pt, d.start, p)) };
      }),
    );
  };

  const startDrag = (e: ReactPointerEvent, next: Drag) => {
    if (tool) return;
    e.stopPropagation();
    onSelect(next.id);
    drag.current = next;
    setDragging(true);
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (!tool) setDraft(null);
  }, [tool]);

  // Clicking empty chart space deselects.
  useEffect(() => {
    const onClick = () => onSelect(null);
    api.chart.subscribeClick(onClick);
    return () => api.chart.unsubscribeClick(onClick);
  }, [api, onSelect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setDraft(null);
        props.onToolDone();
        onSelect(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        onChange(drawings.filter((d) => d.id !== selectedId));
        onSelect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const render = (d: Drawing, isDraft = false) => {
    const pts = d.points.map(toXY);
    const selected = d.id === selectedId;
    const common = {
      stroke: d.color,
      strokeWidth: selected ? 2.5 : 1.5,
      className: isDraft ? undefined : 'shape',
      onPointerDown: (e: ReactPointerEvent) => {
        const start = fromEvent(e);
        if (start) startDrag(e, { kind: 'move', id: d.id, start, original: d.points });
      },
    };
    let shape;
    if (d.type === 'trend') shape = <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} {...common} />;
    else if (d.type === 'hline') shape = <line x1={0} y1={pts[0].y} x2={size.width} y2={pts[0].y} {...common} />;
    else if (d.type === 'vline') shape = <line x1={pts[0].x} y1={0} x2={pts[0].x} y2={size.height} {...common} />;
    else
      shape = (
        <rect
          x={Math.min(pts[0].x, pts[1].x)}
          y={Math.min(pts[0].y, pts[1].y)}
          width={Math.abs(pts[1].x - pts[0].x)}
          height={Math.abs(pts[1].y - pts[0].y)}
          fill={d.color}
          fillOpacity={0.15}
          {...common}
        />
      );
    return (
      <g key={isDraft ? 'draft' : d.id}>
        {/* A wide invisible stroke makes thin lines easy to grab. */}
        {d.type !== 'rect' && !isDraft && (
          <line
            x1={d.type === 'hline' ? 0 : pts[0].x}
            y1={d.type === 'vline' ? 0 : pts[0].y}
            x2={d.type === 'hline' ? size.width : d.type === 'vline' ? pts[0].x : pts[1].x}
            y2={d.type === 'vline' ? size.height : d.type === 'hline' ? pts[0].y : pts[1].y}
            stroke="transparent"
            strokeWidth={12}
            className="shape"
            onPointerDown={common.onPointerDown}
          />
        )}
        {shape}
        {selected &&
          pts.map((p, i) => (
            <circle
              key={i}
              cx={d.type === 'hline' ? size.width / 2 : p.x}
              cy={d.type === 'vline' ? size.height / 2 : p.y}
              r={5}
              fill="#131722"
              stroke={d.color}
              strokeWidth={2}
              className="handle"
              onPointerDown={(e) => startDrag(e, { kind: 'handle', id: d.id, index: i })}
            />
          ))}
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      className={tool || dragging ? 'drawing-layer active' : 'drawing-layer'}
      width={size.width}
      height={size.height}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {drawings.map((d) => render(d))}
      {draft && render(draft, true)}
    </svg>
  );
}

export type DrawingTool = 'trend' | 'hline' | 'vline' | 'rect';

export interface Point {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingTool;
  /** One point for hline/vline, two for trend lines and boxes. */
  points: Point[];
  color: string;
}

export const POINTS_NEEDED: Record<DrawingTool, number> = { trend: 2, hline: 1, vline: 1, rect: 2 };

const key = (symbol: string) => `trade-sim:drawings:${symbol}`;

export function loadDrawings(symbol: string): Drawing[] {
  try {
    return JSON.parse(localStorage.getItem(key(symbol)) ?? '[]') as Drawing[];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, drawings: Drawing[]) {
  try {
    localStorage.setItem(key(symbol), JSON.stringify(drawings));
  } catch {
    // Storage full or blocked: drawings just won't persist.
  }
}

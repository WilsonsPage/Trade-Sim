// Compact bar encoding (format 2). Prices become integers in points and each field is
// stored as a small difference, which shrinks the JSON roughly 4x before gzip.
//
//   t: minutes since the previous bar (first entry 0, offset from t0)
//   o: open - previous close, h: high - max(open, close), l: min(open, close) - low, c: close - open

/** @param {[number, number, number, number, number][]} bars [time, o, h, l, c] */
export function encodeBars(symbol, baseSeconds, digits, bars) {
  const k = 10 ** digits;
  const out = { format: 2, symbol, baseSeconds, digits, t0: bars[0]?.[0] ?? 0, t: [], o: [], h: [], l: [], c: [] };
  let prevT = out.t0;
  let prevC = 0;
  for (const [time, o, h, l, c] of bars) {
    const [O, H, L, C] = [o, h, l, c].map((p) => Math.round(p * k));
    out.t.push((time - prevT) / baseSeconds);
    out.o.push(O - prevC);
    out.h.push(H - Math.max(O, C));
    out.l.push(Math.min(O, C) - L);
    out.c.push(C - O);
    prevT = time;
    prevC = C;
  }
  return out;
}

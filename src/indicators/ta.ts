// Technical-analysis helpers available to indicator scripts as `ta.*`.
// Every function takes and returns arrays aligned to the bars; NaN means "no value yet".

export type Series = number[];

export function sma(src: Series, length: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= length) sum -= src[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(src: Series, length: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  const k = 2 / (length + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (i === length - 1) {
      let sum = 0;
      for (let j = 0; j < length; j++) sum += src[j];
      prev = sum / length;
    } else if (i >= length) {
      prev = src[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/** Wilder's moving average, as used by RSI and ATR. */
export function rma(src: Series, length: number): Series {
  const out = new Array<number>(src.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (i === length - 1) {
      let sum = 0;
      for (let j = 0; j < length; j++) sum += src[j];
      prev = sum / length;
    } else if (i >= length) {
      prev = (prev * (length - 1) + src[i]) / length;
    }
    out[i] = prev;
  }
  return out;
}

export function stdev(src: Series, length: number): Series {
  const mean = sma(src, length);
  return src.map((_, i) => {
    if (Number.isNaN(mean[i])) return NaN;
    let sq = 0;
    for (let j = i - length + 1; j <= i; j++) sq += (src[j] - mean[i]) ** 2;
    return Math.sqrt(sq / length);
  });
}

export function rsi(src: Series, length: number): Series {
  const gains = src.map((v, i) => (i === 0 ? 0 : Math.max(v - src[i - 1], 0)));
  const losses = src.map((v, i) => (i === 0 ? 0 : Math.max(src[i - 1] - v, 0)));
  const g = rma(gains.slice(1), length);
  const l = rma(losses.slice(1), length);
  return [NaN, ...g.map((gv, i) => (l[i] === 0 ? 100 : 100 - 100 / (1 + gv / l[i])))];
}

export function tr(high: Series, low: Series, close: Series): Series {
  return high.map((h, i) =>
    i === 0 ? h - low[i] : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])),
  );
}

export function atr(high: Series, low: Series, close: Series, length: number): Series {
  return rma(tr(high, low, close), length);
}

export function highest(src: Series, length: number): Series {
  return src.map((_, i) => (i < length - 1 ? NaN : Math.max(...src.slice(i - length + 1, i + 1))));
}

export function lowest(src: Series, length: number): Series {
  return src.map((_, i) => (i < length - 1 ? NaN : Math.min(...src.slice(i - length + 1, i + 1))));
}

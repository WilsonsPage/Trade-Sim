// Runs indicator scripts off the main thread, with the browser APIs a script could misuse
// (network, storage, more workers) removed. Scripts are plain JavaScript that people may
// copy from each other, so they only get bar data in and plot values out.

import { runScript, type Plot } from './runScript';
import type { Bar } from '../types';

export interface ScriptJob {
  defs: { id: string; code: string }[];
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
}

export interface ScriptResult {
  results: { id: string; plots: Plot[] }[];
  errors: Record<string, string>;
}

/** Plain JavaScript built-ins scripts may use; everything else on the worker's global is removed. */
const KEEP = new Set([
  'Object', 'Function', 'Array', 'Number', 'Boolean', 'String', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date',
  'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'Promise', 'Proxy', 'Reflect', 'Intl', 'Iterator',
  'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
  'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseFloat', 'parseInt', 'isFinite', 'isNaN', 'Infinity', 'NaN', 'undefined', 'globalThis', 'console',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask',
]);

const post = self.postMessage.bind(self);

self.addEventListener('message', (e: MessageEvent<ScriptJob>) => {
  const { defs, time, open, high, low, close } = e.data;
  const bars: Bar[] = Array.from(time, (t, i) => ({ time: t, open: open[i], high: high[i], low: low[i], close: close[i] }));
  const out: ScriptResult = { results: [], errors: {} };
  for (const def of defs) {
    try {
      out.results.push({ id: def.id, plots: runScript(def.code, bars) });
    } catch (err) {
      out.errors[def.id] = err instanceof Error ? err.message : String(err);
    }
  }
  post(out);
});

// Strip the global scope down to KEEP, walking up the prototype chain where browser APIs live.
for (let obj: object | null = self; obj && obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
  for (const name of Object.getOwnPropertyNames(obj)) {
    if (KEEP.has(name) || name === 'constructor') continue;
    try {
      if (!delete (obj as Record<string, unknown>)[name]) {
        Object.defineProperty(obj, name, { value: undefined, writable: false, configurable: false });
      }
    } catch {
      // A few properties can't be removed; none of them give network or storage access.
    }
  }
}

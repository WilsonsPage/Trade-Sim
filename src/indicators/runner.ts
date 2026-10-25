import type { Bar } from '../types';
import type { ScriptJob, ScriptResult } from './worker';

/** A script that runs longer than this is stopped (most likely an endless loop). */
const TIMEOUT_MS = 2000;

/**
 * Sends indicator jobs to the sandboxed worker one at a time. While a job runs, newer
 * requests replace each other, so fast replay never builds a backlog.
 */
export class ScriptRunner<T> {
  private worker: Worker | null = null;
  private running: { defs: ScriptJob['defs']; tag: T } | null = null;
  private queued: { defs: ScriptJob['defs']; bars: Bar[]; tag: T } | null = null;
  private timer = 0;

  constructor(private onResult: (result: ScriptResult, tag: T) => void) {}

  run(defs: ScriptJob['defs'], bars: Bar[], tag: T) {
    if (this.running) this.queued = { defs, bars, tag };
    else this.send(defs, bars, tag);
  }

  dispose() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.running = this.queued = null;
  }

  private spawn() {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<ScriptResult>) => this.finish(e.data);
    w.onerror = (e) => {
      e.preventDefault();
      this.restart(`Script runner failed: ${e.message}`);
    };
    return w;
  }

  private send(defs: ScriptJob['defs'], bars: Bar[], tag: T) {
    this.worker ??= this.spawn();
    this.running = { defs, tag };
    const col = (f: (b: Bar) => number) => Float64Array.from(bars, f);
    const job: ScriptJob = {
      defs,
      time: col((b) => b.time),
      open: col((b) => b.open),
      high: col((b) => b.high),
      low: col((b) => b.low),
      close: col((b) => b.close),
    };
    this.worker.postMessage(job, [job.time.buffer, job.open.buffer, job.high.buffer, job.low.buffer, job.close.buffer]);
    this.timer = window.setTimeout(() => this.restart(`Stopped: took longer than ${TIMEOUT_MS / 1000}s (endless loop?)`), TIMEOUT_MS);
  }

  /** Kills a stuck or crashed worker and reports every script in the job as failed. */
  private restart(message: string) {
    this.worker?.terminate();
    this.worker = null;
    const defs = this.running?.defs ?? [];
    this.finish({ results: [], errors: Object.fromEntries(defs.map((d) => [d.id, message])) });
  }

  private finish(result: ScriptResult) {
    clearTimeout(this.timer);
    const done = this.running;
    this.running = null;
    if (done) this.onResult(result, done.tag);
    const next = this.queued;
    this.queued = null;
    if (next) this.send(next.defs, next.bars, next.tag);
  }
}

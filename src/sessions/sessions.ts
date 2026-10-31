import { demoDataset, loadIndex, loadWindow, type DatasetInfo } from '../data/load';
import { lastIndexAtOrBefore } from '../replay/useReplay';
import type { TradingState } from '../trading/engine';
import type { Dataset } from '../types';
import { db } from './db';

/** Where a session's bars came from, so it can be reopened later. */
export type DatasetSource = { kind: 'download'; info: DatasetInfo } | { kind: 'demo' } | { kind: 'import'; key: string };

export interface SavedSession {
  id: string;
  symbol: string;
  source: DatasetSource;
  tfSeconds: number;
  /** An optional second chart that replays alongside the main one. */
  second?: { symbol: string; source: DatasetSource; tfSeconds: number };
  startTime: number;
  startBalance: number;
  /** Replay position (index into the raw bars). */
  pos: number;
  /** Time of the bar at `pos` (UTC seconds). Missing in sessions saved by older versions. */
  posTime?: number;
  trading: TradingState;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
}

export const listSessions = async () =>
  (await db.all<SavedSession>('sessions')).sort((a, b) => b.updatedAt - a.updatedAt);

export const saveSession = (s: SavedSession) => db.put('sessions', s);

export async function deleteSession(id: string) {
  const s = await db.get<SavedSession>('sessions', id);
  for (const t of [...(s?.trading.history ?? []), ...(s?.trading.positions ?? [])]) {
    if (t.hasShot) await db.delete('shots', t.id).catch(() => {});
  }
  await db.delete('sessions', id);
}

/** A trade's chart screenshot, as a JPEG data URL. */
export const loadShot = (tradeId: string) => db.get<string>('shots', tradeId);
export const saveShot = (tradeId: string, dataUrl: string) => db.put('shots', dataUrl, tradeId);
export const deleteShot = (tradeId: string) => db.delete('shots', tradeId);

/** Keeps a copy of an imported CSV so its sessions can be resumed. */
export async function storeImported(dataset: Dataset): Promise<DatasetSource> {
  const { bars } = dataset;
  const key = `${dataset.symbol}:${bars[0].time}:${bars[bars.length - 1].time}:${bars.length}`;
  await db.put('datasets', dataset, key);
  return { kind: 'import', key };
}

/** The month (e.g. "2024-03") that `time` falls in, `monthsBack` months earlier. */
export function monthOf(time: number, monthsBack = 0): string {
  const d = new Date(time * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsBack, 1)).toISOString().slice(0, 7);
}

/**
 * Loads the bars for a source. Downloaded data is loaded a few months at a time: some
 * history before `time` and some months after it (more is added as the replay moves on).
 */
export async function loadSource(source: DatasetSource, time: number, opts?: { fromMonth?: string; until?: number }): Promise<Dataset> {
  if (source.kind === 'demo') return demoDataset();
  if (source.kind === 'import') {
    const d = await db.get<Dataset>('datasets', source.key);
    if (!d) throw new Error('The imported data for this session is no longer stored. Import the CSV again.');
    return d;
  }
  // Downloaded data is refreshed weekly; look the symbol up again so the file list is current.
  const info = (await loadIndex()).find((i) => i.symbol === source.info.symbol) ?? source.info;
  return loadWindow(info, time, opts);
}

/**
 * Loads a saved session's data around where it was left, and the raw bar index to resume at.
 */
export async function loadSessionData(s: SavedSession): Promise<{ dataset: Dataset; second?: Dataset; pos: number }> {
  if (s.posTime !== undefined) {
    const dataset = await loadSource(s.source, s.posTime);
    const second = s.second && (await loadSource(s.second.source, s.posTime));
    return { dataset, second, pos: Math.max(0, lastIndexAtOrBefore(dataset.bars, s.posTime)) };
  }
  // Saved by an older version, whose `pos` indexes a file holding the 12 months before the
  // last weekly build. Load the same span so it points at the same bar.
  const saved = s.updatedAt / 1000;
  const opts = { fromMonth: monthOf(saved - 7 * 86400, 12), until: saved };
  const dataset = await loadSource(s.source, s.startTime, opts);
  const second = s.second && (await loadSource(s.second.source, s.startTime, opts));
  return { dataset, second, pos: s.pos };
}

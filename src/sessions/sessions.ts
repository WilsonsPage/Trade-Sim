import { demoDataset, loadDataset, loadIndex, type DatasetInfo } from '../data/load';
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

export async function loadSource(source: DatasetSource): Promise<Dataset> {
  if (source.kind === 'demo') return demoDataset();
  if (source.kind === 'import') {
    const d = await db.get<Dataset>('datasets', source.key);
    if (!d) throw new Error('The imported data for this session is no longer stored. Import the CSV again.');
    return d;
  }
  // Downloaded data is refreshed weekly; look the symbol up again so the file name is current.
  const info = (await loadIndex()).find((i) => i.symbol === source.info.symbol) ?? source.info;
  return loadDataset(info);
}

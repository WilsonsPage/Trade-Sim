// Minimal IndexedDB wrapper: one database, a few key-value stores.

/** sessions: saved sessions; datasets: imported CSVs; shots: trade screenshots by trade id. */
type StoreName = 'sessions' | 'datasets' | 'shots';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('trade-sim', 2);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < 1) {
        req.result.createObjectStore('sessions', { keyPath: 'id' });
        req.result.createObjectStore('datasets');
      }
      if (e.oldVersion < 2) req.result.createObjectStore('shots');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  get: <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  all: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  put: (store: StoreName, value: unknown, key?: string) => run(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
};

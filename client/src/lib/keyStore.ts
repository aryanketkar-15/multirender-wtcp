/**
 * Persistence for the session-bound signing key.
 *
 * A non-extractable CryptoKeyPair can be stored in IndexedDB by structured clone: the handle is
 * saved, the key material never becomes readable to script. One record per session scope; storing
 * a key for a new scope deletes every other record, and logout deletes them all, so a browser never
 * keeps signing keys from earlier sessions.
 *
 * Without IndexedDB (unit tests under jsdom) an in-memory map stands in. Real browsers always have
 * IndexedDB, so production behaviour is the persistent path.
 */
const DB_NAME = 'mra-client';
const STORE = 'keys';

interface Record {
  scope: string;
  pair: CryptoKeyPair;
  createdAt: number;
}

const memory = new Map<string, Record>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'scope' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function loadKey(scope: string): Promise<CryptoKeyPair | null> {
  if (!hasIndexedDb()) return memory.get(scope)?.pair ?? null;
  const rec = await run<Record | undefined>('readonly', (s) => s.get(scope));
  return rec?.pair ?? null;
}

/** Stores the pair for `scope` and removes the keys of every other scope. */
export async function saveKey(scope: string, pair: CryptoKeyPair): Promise<void> {
  const record: Record = { scope, pair, createdAt: Date.now() };
  if (!hasIndexedDb()) {
    memory.clear();
    memory.set(scope, record);
    return;
  }
  await run('readwrite', (s) => s.clear());
  await run('readwrite', (s) => s.put(record));
}

/** Removes every stored key. Called on logout. */
export async function clearKeys(): Promise<void> {
  memory.clear();
  if (hasIndexedDb()) await run('readwrite', (s) => s.clear());
}

export async function countKeys(): Promise<number> {
  if (!hasIndexedDb()) return memory.size;
  return run<number>('readonly', (s) => s.count());
}

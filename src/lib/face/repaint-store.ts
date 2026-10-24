// Repainted photos are too big for localStorage, so they live in the browser's IndexedDB and runs keep
// only a "repaint:<id>" reference. Nothing is stored on the server: the repaint keeps the rest of the
// original photo, which may still show PII.

export const REPAINT_PREFIX = "repaint:"

// Keeps the pre-rename name so repaints saved under the old RLMask name still load.
const DB_NAME = "rlmask"
const STORE = "repaint"

let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.catch(() => (db = null))
  return db
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await open()).transaction(STORE, mode).objectStore(STORE)
  return new Promise((resolve, reject) => {
    const req = run(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const getRepaint = (id: string) => tx<Blob | undefined>("readonly", (s) => s.get(id))
export const putRepaint = (id: string, png: Blob) => tx("readwrite", (s) => s.put(png, id)).then(() => undefined)

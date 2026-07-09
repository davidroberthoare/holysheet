const DB_NAME = 'holysheet';
const DB_VERSION = 1;

export const STORES = {
  sheets: 'sheets',
  playlists: 'playlists',
  annotations: 'annotations',
  settings: 'settings',
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.sheets)) {
        const sheets = db.createObjectStore(STORES.sheets, { keyPath: 'id' });
        sheets.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains(STORES.playlists)) {
        const playlists = db.createObjectStore(STORES.playlists, { keyPath: 'id' });
        playlists.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains(STORES.annotations)) {
        // id is deterministic (`${sheetId}:${page}`), so page lookups are a
        // plain get() and this index only serves "all annotations for a sheet".
        const annotations = db.createObjectStore(STORES.annotations, { keyPath: 'id' });
        annotations.createIndex('sheetId', 'sheetId');
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs `executor` against a live transaction and resolves once the
// transaction actually commits, so callers can chain multiple requests
// on the same transaction without it auto-closing between awaits.
function runTx(storeNames, mode, executor) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result;
        Promise.resolve(executor(transaction))
          .then((r) => {
            result = r;
          })
          .catch(reject);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

export function dbGet(storeName, key) {
  return runTx(storeName, 'readonly', (tx) => reqToPromise(tx.objectStore(storeName).get(key)));
}

export function dbGetAll(storeName) {
  return runTx(storeName, 'readonly', (tx) => reqToPromise(tx.objectStore(storeName).getAll()));
}

export function dbGetAllByIndex(storeName, indexName, query) {
  return runTx(storeName, 'readonly', (tx) =>
    reqToPromise(tx.objectStore(storeName).index(indexName).getAll(query))
  );
}

export function dbPut(storeName, value) {
  return runTx(storeName, 'readwrite', (tx) => reqToPromise(tx.objectStore(storeName).put(value)));
}

export function dbDelete(storeName, key) {
  return runTx(storeName, 'readwrite', (tx) => reqToPromise(tx.objectStore(storeName).delete(key)));
}

export function dbClear(storeName) {
  return runTx(storeName, 'readwrite', (tx) => reqToPromise(tx.objectStore(storeName).clear()));
}

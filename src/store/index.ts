/**
 * LocalStore - Persistencia local-first (reemplaza Firestore)
 *
 * TikBoost es un sistema libre de SWAL, sin backend cloud.
 * Toda la persistencia vive en IndexedDB del navegador.
 *
 * API similar a Firestore (doc/collection) para migración mínima:
 *   await localStore.set("tiktokConnections", userId, data)
 *   const data = await localStore.get("tiktokConnections", userId)
 */

const DB_NAME = "tiktboost-db";
const DB_VERSION = 2;

/**
 * Migraciones versionadas (fix P2 kimi #6)
 * Cada entrada: (oldVersion, newVersion, migrate(db, tx))
 */
const MIGRATIONS: Array<{
  from: number;
  to: number;
  migrate: (db: IDBDatabase) => void;
}> = [
  // v1 → v2: schema inicial (kv store). Las futuras migraciones se añaden aquí.
  {
    from: 0,
    to: 1,
    migrate: (db) => {
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    },
  },
  {
    from: 1,
    to: 2,
    migrate: () => {
      // v2: sin cambios de schema — reservado para futuras migraciones.
      // (ej. índices por colección, stores separados por dominio)
      console.info("[local-store] migración v1→v2 (no-op)");
    },
  },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const reqInfo = req as IDBOpenDBRequest & { oldVersion: number; newVersion: number };
      const oldVersion = reqInfo.oldVersion ?? 0;
      const newVersion = reqInfo.newVersion ?? DB_VERSION;

      // Aplicar migraciones secuenciales
      for (let v = oldVersion; v < newVersion; v++) {
        const migration = MIGRATIONS.find((m) => m.from === v && m.to === v + 1);
        if (migration) {
          migration.migrate(db);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

/**
 * Reset del cache de conexión (solo tests)
 */
export function __resetLocalStoreDb(): void {
  dbPromise = null;
}

/**
 * Limpia TODOS los datos del store kv (solo tests)
 */
export async function __clearLocalStore(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Store un valor bajo una clave compuesta collection/doc
 */
export async function setItem(collection: string, docId: string, value: unknown): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, `${collection}/${docId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lee un documento; retorna undefined si no existe
 */
export async function getItem<T = unknown>(
  collection: string,
  docId: string,
): Promise<T | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(`${collection}/${docId}`);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Elimina un documento
 */
export async function removeItem(collection: string, docId: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(`${collection}/${docId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lista todos los documentos de una colección
 */
export async function listCollection<T = unknown>(
  collection: string,
): Promise<Array<{ id: string; data: T }>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const store = tx.objectStore("kv");
    const results: Array<{ id: string; data: T }> = [];
    const req = store.openCursor();
    const prefix = `${collection}/`;
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const key = String(cursor.key);
        if (key.startsWith(prefix)) {
          results.push({ id: key.slice(prefix.length), data: cursor.value as T });
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Transacción read-modify-write atómica (fix P1 kimi review)
 *
 * Lee el doc, aplica el mutator y escribe DENTRO de la misma transacción
 * IndexedDB — evita lost updates entre tabs/workers.
 *
 * @param collection - colección
 * @param docId - id del documento
 * @param mutator - recibe el doc actual (o undefined) y devuelve el nuevo valor (o null para borrar)
 */
export async function transaction<T = unknown>(
  collection: string,
  docId: string,
  mutator: (current: T | undefined) => T | null | Promise<T | null>,
): Promise<T | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const key = `${collection}/${docId}`;
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");

    let resolvedValue: T | null | undefined;

    const getReq = store.get(key);
    getReq.onsuccess = async () => {
      const current = getReq.result as T | undefined;
      let next: T | null;
      try {
        next = await mutator(current);
      } catch (err) {
        tx.abort();
        reject(err);
        return;
      }
      resolvedValue = next;
      if (next === null) {
        store.delete(key);
      } else {
        store.put(next, key);
      }
    };
    getReq.onerror = () => reject(getReq.error);

    tx.oncomplete = () => {
      // broadcast de cambio (sync multi-tab) tras commit exitoso
      const next = resolvedValue as T | null;
      broadcastChange(collection, docId, next);
      resolve(next);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error("Transacción abortada"));
  });
}

// ─── Sync multi-tab (BroadcastChannel) ────────────────────────────────────

const CHANNEL_NAME = "tiktboost-store-sync";
let channel: BroadcastChannel | null = null;

/**
 * Reset del channel (solo tests)
 */
export function __resetStoreChannel(): void {
  if (channel) {
    try {
      channel.close();
    } catch {
      // noop
    }
  }
  channel = null;
}

type StoreChangeEvent<T = unknown> = {
  type: "store-change";
  collection: string;
  docId: string;
  data: T | null;
  ts: number;
};

/**
 * BroadcastChannel para notificar cambios entre tabs del mismo origin
 */
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

function broadcastChange<T>(collection: string, docId: string, data: T | null): void {
  const ch = getChannel();
  if (!ch) return;
  const event: StoreChangeEvent<T> = {
    type: "store-change",
    collection,
    docId,
    data,
    ts: Date.now(),
  };
  try {
    ch.postMessage(event);
  } catch {
    // noop — broadcast es best-effort
  }
}

export interface StoreSyncHandler<T = unknown> {
  collection?: string;
  onchange: (docId: string, data: T | null) => void;
}

/**
 * Suscríbete a cambios de store en otras tabs (sync multi-tab)
 */
export function subscribeToStoreChanges<T = unknown>(handler: StoreSyncHandler<T>): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }
  const listener = (ev: MessageEvent<StoreChangeEvent<T>>) => {
    const msg = ev.data;
    if (!msg || msg.type !== "store-change") return;
    if (handler.collection && msg.collection !== handler.collection) return;
    handler.onchange(msg.docId, msg.data);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

/**
 * Exporta TODOS los datos del store a un objeto JSON (fix P2 kimi #6)
 * Para backup manual o migración entre navegadores/dispositivos.
 */
export async function exportStore(): Promise<Record<string, unknown>> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const store = tx.objectStore("kv");
    const data: Record<string, unknown> = {};
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        data[String(cursor.key)] = cursor.value;
        cursor.continue();
      } else {
        resolve(data);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Importa datos (formato exportStore) — reemplaza TODO el store (fix P2 kimi #6)
 * @returns cantidad de claves importadas
 */
export async function importStore(data: Record<string, unknown>): Promise<number> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    store.clear();
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      store.put(value, key);
      count++;
    }
    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Exporta el store como JSON string (para descargar archivo)
 */
export async function exportStoreJSON(): Promise<string> {
  const data = await exportStore();
  return JSON.stringify(
    { app: "tiktboost", version: DB_VERSION, exportedAt: Date.now(), data },
    null,
    2,
  );
}

/**
 * API estilo Firestore para migración mínima
 */
export const localStore = {
  set: setItem,
  get: getItem,
  remove: removeItem,
  list: listCollection,
  transaction,
};

/**
 * Guardar tokens sensibles (TikTok OAuth, etc.) — IndexedDB con key separada
 */
export const secureStore = {
  set: (key: string, value: unknown) => setItem("secure", key, value),
  get: <T = unknown>(key: string) => getItem<T>("secure", key),
  remove: (key: string) => removeItem("secure", key),
};

const DB_NAME = 'pdftools-sessions';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_SCHEMA = 1;

export interface SessionStorageErrorDetail {
  key: string;
  quotaExceeded: boolean;
  message: string;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;
const storageErrorListeners = new Set<(detail: SessionStorageErrorDetail) => void>();

function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function isQuotaExceeded(error: unknown): boolean {
  const candidate = error as { name?: string; code?: number } | null | undefined;
  return (
    candidate?.name === 'QuotaExceededError' ||
    candidate?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate?.code === 22
  );
}

function notifyStorageError(error: unknown, key: string): void {
  const detail: SessionStorageErrorDetail = {
    key,
    quotaExceeded: isQuotaExceeded(error),
    message:
      (error as { message?: string } | null | undefined)?.message || 'Session could not be saved.'
  };
  storageErrorListeners.forEach(listener => {
    try {
      listener(detail);
    } catch (listenerError) {
      console.warn('[PDFTools] Session storage error listener failed.', listenerError);
    }
  });
}

export function onSessionStorageError(
  listener: (detail: SessionStorageErrorDetail) => void
): () => void {
  storageErrorListeners.add(listener);
  return () => storageErrorListeners.delete(listener);
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isSupported()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    console.warn('[PDFTools] IndexedDB unavailable, sessions will not persist.', error);
    return null;
  });

  return databasePromise;
}

export async function saveSession(key: string, value: unknown): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise(resolve => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ schema: SESSION_SCHEMA, value }, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        notifyStorageError(transaction.error, key);
        resolve(false);
      };
      transaction.onabort = () => {
        notifyStorageError(transaction.error, key);
        resolve(false);
      };
    } catch (error) {
      notifyStorageError(error, key);
      resolve(false);
    }
  });
}

export async function loadSession<T = unknown>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise(resolve => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const record = request.result as { schema?: number; value?: T } | undefined;
        if (!record) {
          resolve(null);
          return;
        }

        // Ignore sessions written by a newer schema instead of crashing.
        if (typeof record.schema === 'number' && record.schema > SESSION_SCHEMA) {
          resolve(null);
          return;
        }

        resolve(record.value ?? null);
      };
      request.onerror = () => resolve(null);
    } catch (error) {
      console.warn('[PDFTools] Unable to read session.', error);
      resolve(null);
    }
  });
}

export async function clearSession(key: string): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise(resolve => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function clearAllSessions(): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise(resolve => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

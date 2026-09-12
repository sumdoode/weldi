import { createSyncEngine, SyncError } from "./syncCore.js";

// Preserve this name, version, store names and existing request IDs: upgrades
// must be able to recover inspections already saved by previous releases.
const DB_NAME = "weld-photo-log";
const STORE = "syncQueue";
const CACHE_STORE = "appCache";
const VERSION = 2;

// Some older iPhone Safari versions provide Web Crypto but not randomUUID().
const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const openDb = () => new Promise((resolve, reject) => {
  let expired = false;
  const request = indexedDB.open(DB_NAME, VERSION);
  const timer = setTimeout(() => {
    expired = true;
    reject(new SyncError("Phone storage is not responding. Reopen this same app/browser; do not clear its website data.", "storage"));
  }, 10000);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
  };
  request.onsuccess = () => {
    clearTimeout(timer);
    if (expired) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => { clearTimeout(timer); reject(request.error); };
});

const transaction = async (storeNames, mode, action) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx, result;
    try { tx = db.transaction(storeNames, mode); } catch (error) { db.close(); reject(error); return; }
    const timer = setTimeout(() => {
      try { tx.abort(); } catch { /* It may already have been closed. */ }
      db.close();
      reject(new SyncError("Phone storage timed out. Do not clear website data; reopen the app and retry.", "storage"));
    }, 15000);
    const finish = () => { clearTimeout(timer); db.close(); };
    // A request's success event is NOT a transaction commit. Never tell the
    // form it is saved (or delete a queued photo) before this event.
    tx.oncomplete = () => { finish(); resolve(result); };
    tx.onabort = tx.onerror = () => { finish(); reject(tx.error || new Error("Phone storage could not save this change.")); };
    try { action(tx, value => { result = value; }); }
    catch (error) { try { tx.abort(); } catch { /* already aborted */ } finish(); reject(error); }
  });
};

const withStore = (mode, action, storeName = STORE) => transaction([storeName], mode, (tx, done) => {
  const request = action(tx.objectStore(storeName));
  request.onsuccess = () => done(request.result);
});

export const getPending = () => withStore("readonly", store => store.getAll());
export const putPending = item => withStore("readwrite", store => store.put(item));
export const deletePending = id => withStore("readwrite", store => store.delete(id));
export const getCachedAppData = () => withStore("readonly", store => store.get("latest"), CACHE_STORE);
export const cacheAppData = data => withStore("readwrite", store => store.put(data, "latest"), CACHE_STORE);

export function acknowledge(id, record) {
  return transaction([STORE, CACHE_STORE], "readwrite", (tx, done) => {
    const cache = tx.objectStore(CACHE_STORE);
    const request = cache.get("latest");
    request.onsuccess = () => {
      const previous = request.result || { records: [], welders: [] };
      cache.put({ ...previous, records: [record, ...(previous.records || []).filter(r => r.id !== record.id)], savedAt: new Date().toISOString() }, "latest");
      tx.objectStore(STORE).delete(id);
      done(record);
    };
  });
}

export async function preparePhoto(photo, name = "") {
  if (!(photo instanceof Blob) || !photo.size) throw new SyncError("The saved photo cannot be read. This inspection was kept; do not clear website data.", "photo", false);
  if (photo.size > 15 * 1024 * 1024) throw new SyncError("This photo exceeds the app's 15 MB upload limit. It was kept on the device.", "upload-size", false);
  const extension = name.split(".").pop()?.toLowerCase();
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
  const type = photo.type?.startsWith("image/") ? photo.type : types[extension];
  if (!type) throw new SyncError("The photo's image type is missing or unsupported. The inspection was kept.", "photo", false);
  let timer;
  try {
    const bytes = await Promise.race([
      photo.arrayBuffer(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new SyncError("Reading the saved photo timed out. Reopen this app and retry; do not clear website data.", "photo")), 15000); })
    ]);
    if (bytes.byteLength !== photo.size) throw new SyncError("The saved photo could not be read completely. It was kept on this device.", "photo", false);
    // Materialize the bytes, rather than reusing a camera/temp-file-backed
    // File in FormData after an offline session or iOS page suspension.
    return new Blob([bytes], { type });
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("This saved photo is no longer readable by the browser. The queue entry was kept; do not clear website data.", "photo", false);
  } finally { clearTimeout(timer); }
}

export async function queueInspection(type, fields, photo, targetClientId = null, targetRecordId = null) {
  const storedPhoto = await preparePhoto(photo, photo?.name);
  const item = {
    id: createId(), type, fields, photo: storedPhoto, targetClientId, targetRecordId,
    photoName: photo?.name || `${type}.jpg`,
    createdAt: new Date().toISOString(), status: "pending", error: ""
  };
  await putPending(item);
  window.dispatchEvent(new Event("weld-queue-added"));
  return item;
}

const engine = createSyncEngine({ getPending, putPending, acknowledge, preparePhoto,
  notify: () => window.dispatchEvent(new Event("weld-sync-change"))
});
let activeSync = null;
export function syncPending(options) {
  if (activeSync) return activeSync;
  // Web Locks serialize tabs/PWA windows when supported; the engine's
  // single-flight guard still works where Web Locks are unavailable.
  activeSync = (globalThis.navigator?.locks?.request
    ? navigator.locks.request("weld-photo-log-sync", { ifAvailable: true }, async lock => lock
      ? engine.sync(options)
      : { synced: 0, pending: (await getPending()).length, code: "busy", message: "Another window is syncing. Retrying shortly.", retryable: true })
    : engine.sync(options)).finally(() => { activeSync = null; });
  return activeSync;
}
export const pauseSync = () => engine.pause();

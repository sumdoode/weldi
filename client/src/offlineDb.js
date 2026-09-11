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
  const request = indexedDB.open(DB_NAME, VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const withStore = async (mode, action, storeName = STORE) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
};

export const getPending = () => withStore("readonly", store => store.getAll());
export const putPending = item => withStore("readwrite", store => store.put(item));
export const deletePending = id => withStore("readwrite", store => store.delete(id));
export const getCachedAppData = () => withStore("readonly", store => store.get("latest"), CACHE_STORE);
export const cacheAppData = data => withStore("readwrite", store => store.put(data, "latest"), CACHE_STORE);

export async function queueInspection(type, fields, photo, targetClientId = null, targetRecordId = null) {
  const item = {
    id: createId(), type, fields, photo, targetClientId, targetRecordId,
    photoName: photo?.name || `${type}.jpg`,
    createdAt: new Date().toISOString(), status: "pending", error: ""
  };
  await putPending(item);
  return item;
}

const endpointFor = item => {
  if (item.type === "root") return "/api/welds";
  if (item.type === "final-only") return "/api/welds/final-only";
  if (item.targetClientId) return `/api/welds/client/${encodeURIComponent(item.targetClientId)}/final`;
  return `/api/welds/${encodeURIComponent(item.targetRecordId)}/final`;
};

export async function checkServer() {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function syncPending() {
  const pendingBeforeSync = await getPending();
  if (!(await checkServer())) return { synced: 0, pending: pendingBeforeSync.length, serverAvailable: false };
  const items = pendingBeforeSync.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let synced = 0;
  for (const item of items) {
    const current = { ...item, status: "syncing", error: "" };
    await putPending(current);
    try {
      const body = new FormData();
      Object.entries(item.fields).forEach(([key, value]) => body.set(key, value));
      body.set("clientRequestId", item.id);
      if (item.photo) body.set("photo", item.photo, item.photoName);
      const response = await fetch(endpointFor(item), { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Upload failed (${response.status})`);
      await deletePending(item.id);
      synced += 1;
    } catch (error) {
      const connectionFailed = error instanceof TypeError || error.name === "AbortError";
      await putPending({ ...item, status: connectionFailed ? "pending" : "failed", error: connectionFailed ? "Waiting for a stable server connection." : error.message || "Upload failed" });
      // Preserve creation order: a final may depend on the root immediately before it.
      const remaining = await getPending();
      window.dispatchEvent(new CustomEvent("weld-sync-change"));
      return { synced, pending: remaining.length, serverAvailable: !connectionFailed };
    }
  }
  const remaining = await getPending();
  window.dispatchEvent(new CustomEvent("weld-sync-change"));
  return { synced, pending: remaining.length, serverAvailable: true };
}

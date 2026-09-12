// The queue is durable; network availability is always tested, never inferred
// from navigator.onLine. These functions also run under node:test.
export class SyncError extends Error {
  constructor(message, code = "network", retryable = true) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.retryable = retryable;
  }
}

// Only these parser errors indicate an unfinished multipart body. Do not
// retry every HTTP 400: validation and missing-boundary errors need attention.
const incompleteFormMessage = value => typeof value === "string"
  && /^Unexpected end of (form|file)$/.test(value.trim());
const previouslyMisclassifiedUpload = item => item.errorCode === "http-400"
  && incompleteFormMessage(String(item.error || "").replace(/ \(HTTP 400\)\.$/, ""));

export async function requestJson(url, options = {}) {
  const { timeoutMs = 15000, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  let rejectPause;
  const paused = new Promise((_, reject) => { rejectPause = reject; });
  const cancel = () => {
    controller.abort();
    rejectPause(new SyncError("Sync paused. It will retry when you return to the app.", "paused"));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SyncError("The server took too long to respond. The inspection is still saved on this device.", "timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, paused, (async () => {
      const response = await fetch(url, {
        ...fetchOptions, credentials: "same-origin", cache: "no-store", signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        throw new SyncError("Server sign-in is required. Sign in again, then tap Sync now. Nothing was removed from this device.", "auth", false);
      }
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await response.json().catch(() => null) : null;
      if (!response.ok) {
        if (response.status === 413) throw new SyncError("The server or proxy rejected the photo size (HTTP 413). The photo is still on this device.", "upload-size", false);
        if (data?.code === "UPLOAD_INCOMPLETE" || (response.status === 400 && incompleteFormMessage(data?.error))) {
          throw new SyncError("The photo upload arrived incomplete. It is still saved on this device and will retry while the app is open.", "upload-incomplete", true);
        }
        const retryable = response.status >= 500 || [408, 425, 429].includes(response.status);
        // Do not display proxy HTML (or inject it into the app).
        throw new SyncError(`${typeof data?.error === "string" ? data.error.slice(0, 250) : "Request rejected"} (HTTP ${response.status}).`, `http-${response.status}`, retryable);
      }
      if (!data || response.redirected) {
        throw new SyncError("The server returned a login page or an unexpected response. Check the app address and sign in again. Pending photos have been kept.", "unexpected-response", false);
      }
      return data;
    })()]);
  } catch (error) {
    if (error instanceof SyncError) throw error;
    if (signal?.aborted) throw new SyncError("Sync paused. It will retry when you return to the app.", "paused");
    if (controller.signal.aborted) throw new SyncError("Upload timed out. The inspection is still saved on this device.", "timeout");
    throw new SyncError("Cannot reach the app server. Keep the app open; it will retry automatically. If using your computer as the server, stay on the same Wi-Fi and keep the server running.", "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export function endpointFor(item) {
  if (item.type === "root") return "/api/welds";
  if (item.type === "final-only") return "/api/welds/final-only";
  if (item.type === "final" && item.targetClientId) return `/api/welds/client/${encodeURIComponent(item.targetClientId)}/final`;
  if (item.type === "final" && item.targetRecordId) return `/api/welds/${encodeURIComponent(item.targetRecordId)}/final`;
  throw new SyncError("The queued inspection has no matching weld. It has been kept on this device.", "invalid-record", false);
}

function validAcknowledgement(item, record) {
  if (!record || typeof record.id !== "string") return false;
  if (item.type === "final") return record.clientFinalRequestId === item.id && !!record.finalPhotoFilename;
  return record.clientRequestId === item.id && !!record[item.type === "root" ? "rootPhotoFilename" : "finalPhotoFilename"];
}

export function createSyncEngine({ getPending, putPending, acknowledge, preparePhoto, notify = () => {}, request = requestJson }) {
  let active = null;
  let controller = null;

  async function execute({ force = false } = {}) {
    const items = await getPending();
    let synced = 0;
    try {
      const health = await request("/api/health", { timeoutMs: 8000, signal: controller.signal });
      if (health?.ok !== true) throw new SyncError("This address did not return the Weld Photo Log health response. Pending inspections have been kept.", "unexpected-response", false);
    } catch (error) {
      return { synced, pending: items.length, serverAvailable: false, code: error.code || "network", message: error.message, retryable: error.retryable !== false };
    }
    // Creation commands first, even when the device's clock has changed. A
    // failed root blocks only its dependent final, not other welds.
    items.sort((a, b) => Number(a.type === "final") - Number(b.type === "final") || a.createdAt.localeCompare(b.createdAt));
    const remainingIds = new Set(items.map(item => item.id));
    let lastError = null;
    for (const item of items) {
      if (controller.signal.aborted) break;
      if (item.retryable === false && !force && !previouslyMisclassifiedUpload(item)) continue;
      if (item.type === "final" && item.targetClientId && remainingIds.has(item.targetClientId)) continue;
      try {
        const photo = await preparePhoto(item.photo, item.photoName);
        if (controller.signal.aborted) break;
        await putPending({ ...item, status: "syncing", error: "", errorCode: "", retryable: true, attempts: (item.attempts || 0) + 1 });
        notify();
        const body = new FormData();
        Object.entries(item.fields).forEach(([key, value]) => body.set(key, String(value ?? "UNK")));
        body.set("clientRequestId", item.id);
        body.set("photo", photo, item.photoName || "inspection.jpg");
        // Fresh FormData on each attempt; never manually set Content-Type.
        // The header lets the server identify a request even if its form body
        // gets cut off before the clientRequestId field arrives.
        const data = await request(endpointFor(item), { method: "POST", body, headers: { "X-Weld-Request-ID": item.id }, timeoutMs: 90000, signal: controller.signal });
        if (!validAcknowledgement(item, data.record)) {
          throw new SyncError("The server did not confirm this inspection and photo. Nothing was removed; update the server and retry.", "unconfirmed", false);
        }
        // Save the confirmed server record locally and remove the pending
        // command in ONE committed IndexedDB transaction.
        await acknowledge(item.id, data.record);
        remainingIds.delete(item.id);
        synced += 1;
      } catch (error) {
        lastError = error;
        const incompleteAttempts = error.code === "upload-incomplete" ? (item.incompleteAttempts || 0) + 1 : 0;
        const message = (error.message || "Sync failed; inspection kept.") + (incompleteAttempts >= 3 ? " This has happened repeatedly. Check the connection and host/proxy upload handling; see the request ID below." : "");
        await putPending({ ...item, status: error.retryable === false ? "failed" : "pending", error: message, errorCode: error.code || "storage", retryable: error.retryable !== false, attempts: (item.attempts || 0) + 1, incompleteAttempts });
        // Network, login and unexpected-response errors affect the whole
        // service. An incomplete form affects one request; keep it queued,
        // skip its dependent final, and let unrelated welds make progress.
        if ((error.retryable !== false && error.code !== "upload-incomplete") || ["auth", "unexpected-response", "unconfirmed"].includes(error.code)) break;
      } finally {
        notify();
      }
    }
    const remaining = await getPending();
    const failed = remaining.filter(item => item.retryable === false);
    return {
      synced, pending: remaining.length,
      serverAvailable: !lastError || !["network", "timeout", "auth", "paused", "unexpected-response"].includes(lastError.code),
      code: lastError?.code || (failed.length ? "failed" : "ok"),
      message: lastError?.message || (failed.length ? `${failed.length} inspection(s) need attention. See Pending uploads below.` : ""),
      retryable: !["auth", "unexpected-response", "unconfirmed"].includes(lastError?.code)
        && remaining.some(item => item.retryable !== false && !(item.targetClientId && remaining.some(root => root.id === item.targetClientId && root.retryable === false)))
    };
  }

  return {
    sync(options) {
      if (active) return active;
      controller = new AbortController();
      active = execute(options).finally(() => { active = null; controller = null; });
      return active;
    },
    pause() { controller?.abort(); }
  };
}

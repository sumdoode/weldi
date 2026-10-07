import { useCallback, useEffect, useRef, useState } from "react";
import { cacheAppData, cacheUpdatedRecord, getCachedAppData, getPending, pauseSync, syncPending } from "../offlineDb.js";
import { requestJson } from "../syncCore.js";
import { createSyncScheduler } from "../syncScheduler.js";
import useDisplayedRecords from "./useDisplayedRecords.js";

export default function useWeldData({ onError, onNotice }) {
  const [records, setRecords] = useState([]);
  const [welders, setWelders] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncCode, setSyncCode] = useState("");
  const schedulerRef = useRef(null);
  const { displayedRecords, awaiting } = useDisplayedRecords(records, pending);

  const refreshPending = useCallback(async () => {
    const items = await getPending();
    setPending(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, []);

  const refreshLocal = useCallback(async () => {
    const [items, cached] = await Promise.all([getPending(), getCachedAppData()]);
    setPending(items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    if (cached) {
      setRecords(cached.records || []);
      setWelders(cached.welders || []);
    }
  }, []);

  const load = useCallback(async () => {
    const [weldData, welderData] = await Promise.all([
      requestJson("/api/welds"),
      requestJson("/api/welders"),
    ]);
    if (!Array.isArray(weldData.records) || !Array.isArray(welderData.welders)) {
      throw new Error("The server did not return a weld record list.");
    }
    await cacheAppData({
      records: weldData.records,
      welders: welderData.welders,
      savedAt: new Date().toISOString(),
    });
    setRecords(weldData.records);
    setWelders(welderData.welders);
  }, []);

  const runSync = useCallback(async (options) => {
    setSyncing(true);
    try {
      const result = await syncPending(options);
      if (typeof result.serverAvailable === "boolean") {
        setServerAvailable(result.serverAvailable);
      }
      setSyncMessage(result.message || "");
      setSyncCode(result.code || "");
      await refreshLocal();
      if (result.synced) {
        onNotice(`${result.synced} inspection${result.synced === 1 ? "" : "s"} confirmed by the server.`);
      }
      if (result.serverAvailable) {
        try {
          await load();
        } catch (error) {
          setSyncMessage(`Saved records remain on this device. Could not refresh the server list: ${error.message}`);
        }
      }
      return result;
    } catch (error) {
      setSyncMessage(error.message || "Sync could not finish. Pending inspections have been kept.");
      setSyncCode("storage");
      throw error;
    } finally {
      setSyncing(false);
    }
  }, [load, refreshLocal, onNotice]);

  useEffect(() => {
    const onQueue = () => refreshLocal().catch((error) => onError(error.message));
    const onOffline = () => setServerAvailable(false);
    refreshLocal()
      .then(() => setReady(true))
      .catch((error) => onError(error.message))
      .finally(() => setLoading(false));
    window.addEventListener("weld-sync-change", onQueue);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("weld-sync-change", onQueue);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshLocal, onError]);

  useEffect(() => {
    if (!ready) return;
    const scheduler = createSyncScheduler({ run: runSync, pause: pauseSync });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.stop();
      schedulerRef.current = null;
    };
  }, [ready, runSync]);

  async function updateRecord(id, fields) {
    const data = await requestJson(`/api/welds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!data.record || data.record.id !== id) {
      throw new Error("The server did not confirm the edited record. Please retry.");
    }
    setRecords((current) => current.map((record) => record.id === id ? data.record : record));
    try {
      await cacheUpdatedRecord(data.record);
    } catch (error) {
      onError(`Changes were saved to the server, but the offline record cache could not be updated: ${error.message}`);
    }
    return data.record;
  }

  async function removeRecord(id) {
    if (!confirm("Delete this weld record and all of its photos?")) return;
    const response = await fetch(`/api/welds/${id}`, { method: "DELETE" });
    if (response.ok) setRecords(records.filter((record) => record.id !== id));
  }

  return {
    records,
    welders,
    setWelders,
    pending,
    loading,
    ready,
    serverAvailable,
    syncing,
    syncMessage,
    syncCode,
    displayedRecords,
    awaiting,
    refreshPending,
    updateRecord,
    removeRecord,
    retrySync: () => schedulerRef.current?.retry(),
  };
}

import { useEffect, useMemo } from "react";

function applyFinal(record, item) {
  if (!item) return record;
  return {
    ...record,
    ...item.fields,
    status: "COMPLETE",
    finalPhotoUrl: item._photoUrl,
    syncStatus: item.status,
  };
}

export default function useDisplayedRecords(records, pending) {
  const pendingViews = useMemo(() => {
    const urls = [];
    const finalsByClient = new Map();
    const finalsByRecord = new Map();

    function photoUrl(item) {
      if (!(item.photo instanceof Blob)) return null;
      const url = URL.createObjectURL(item.photo);
      urls.push(url);
      return url;
    }

    pending.filter((item) => item.type === "final").forEach((item) => {
      const view = { ...item, _photoUrl: photoUrl(item) };
      const finals = item.targetClientId ? finalsByClient : finalsByRecord;
      finals.set(item.targetClientId || item.targetRecordId, view);
    });

    const roots = pending.filter((item) => item.type === "root").map((item) => {
      const record = {
        id: `local-${item.id}`,
        _pendingClientId: item.id,
        status: "AWAITING_FINAL",
        ...item.fields,
        welderId: item.fields.welderId,
        finalWelderId: "UNK",
        finalDate: "UNK",
        finalVtDate: "UNK",
        rootPhotoUrl: photoUrl(item),
        finalPhotoUrl: null,
        syncStatus: item.status,
      };
      return applyFinal(record, finalsByClient.get(item.id));
    });

    const direct = pending.filter((item) => item.type === "final-only").map((item) => ({
      id: `local-${item.id}`,
      status: "COMPLETE",
      lineNo: item.fields.lineNo,
      weldNo: item.fields.weldNo,
      rework: "N/A",
      welderId: "N/A",
      rootDate: "N/A",
      rootVtDate: "N/A",
      finalWelderId: item.fields.finalWelderId,
      finalDate: item.fields.finalDate,
      finalVtDate: item.fields.finalVtDate,
      rootPhotoUrl: null,
      finalPhotoUrl: photoUrl(item),
      syncStatus: item.status,
    }));

    return { roots, direct, finalsByRecord, finalsByClient, urls };
  }, [pending]);

  useEffect(() => {
    return () => pendingViews.urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingViews]);

  // Hide a server record if the same creation is still in the local queue.
  const localCreates = new Set(
    pending.filter((item) => item.type !== "final").map((item) => item.id),
  );
  const serverRecords = records
    .filter((record) => !localCreates.has(record.clientRequestId))
    .map((record) => applyFinal(
      record,
      pendingViews.finalsByRecord.get(record.id)
        || pendingViews.finalsByClient.get(record.clientRequestId),
    ));
  const displayedRecords = [...pendingViews.direct, ...pendingViews.roots, ...serverRecords];
  const awaiting = displayedRecords.filter((record) => record.status !== "COMPLETE");

  return { displayedRecords, awaiting };
}

import { useRef, useState } from "react";
import AppHeader from "./components/AppHeader.jsx";
import AppTabs from "./components/AppTabs.jsx";
import EditRecordModal from "./components/EditRecordModal.jsx";
import ExportActions from "./components/ExportActions.jsx";
import FinalInspectionModal from "./components/FinalInspectionModal.jsx";
import InspectionForm from "./components/InspectionForm.jsx";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt.jsx";
import RecordSearch from "./components/RecordSearch.jsx";
import SyncStatus from "./components/SyncStatus.jsx";
import WeldRecords from "./components/WeldRecords.jsx";
import WelderManager from "./components/WelderManager.jsx";
import useInspectionPhoto from "./hooks/useInspectionPhoto.js";
import useWeldData from "./hooks/useWeldData.js";
import { queueInspection } from "./offlineDb.js";
import { clean } from "./utils/inspectionFields.js";
import filterRecords from "./utils/filterRecords.js";

export default function App() {
  const [tab, setTab] = useState("root");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [manage, setManage] = useState(false);
  const [welderId, setWelderId] = useState("UNK");
  const [directWelderId, setDirectWelderId] = useState("UNK");
  const [finalRecord, setFinalRecord] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [finalWelderId, setFinalWelderId] = useState("UNK");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formRef = useRef(null);
  const directFormRef = useRef(null);
  const rootPhoto = useInspectionPhoto(setError);
  const directPhoto = useInspectionPhoto(setError);
  const finalPhoto = useInspectionPhoto(setError);
  const {
    records, welders, setWelders, pending, loading, ready,
    serverAvailable, syncing, syncMessage, syncCode,
    displayedRecords, awaiting, refreshPending, updateRecord, removeRecord, retrySync,
  } = useWeldData({ onError: setError, onNotice: setNotice });
  const filteredRecords = filterRecords(displayedRecords, searchQuery, searchField);
  const filteredAwaiting = filterRecords(awaiting, searchQuery, searchField);
  const searching = Boolean(searchQuery.trim());

  function resetRoot() {
    formRef.current?.reset();
    rootPhoto.clear();
    setWelderId("UNK");
  }

  function resetDirect() {
    directFormRef.current?.reset();
    directPhoto.clear();
    setDirectWelderId("UNK");
  }

  async function saveRoot(event) {
    event.preventDefault();
    if (!rootPhoto.photo) {
      setError("Take or choose a root inspection photo first.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const raw = new FormData(event.currentTarget);
    const fields = {};
    ["lineNo", "weldNo", "rework", "rootDate", "rootVtDate"].forEach((key) => {
      fields[key] = clean(raw.get(key));
    });
    fields.welderId = welderId;

    try {
      await queueInspection("root", fields, rootPhoto.photo);
      resetRoot();
      await refreshPending();
      setNotice(`Root inspection for weld ${fields.weldNo} saved on this phone — pending sync.`);
      setTab("awaiting");
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDirect(event) {
    event.preventDefault();
    if (!directPhoto.photo) {
      setError("Take or choose a final inspection photo.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const raw = new FormData(event.currentTarget);
    const fields = {};
    ["lineNo", "weldNo", "finalDate", "finalVtDate"].forEach((key) => {
      fields[key] = clean(raw.get(key));
    });
    fields.finalWelderId = directWelderId;

    try {
      await queueInspection("final-only", fields, directPhoto.photo);
      resetDirect();
      await refreshPending();
      setNotice(`Final-only inspection for weld ${fields.weldNo} saved on this phone — pending sync.`);
      setTab("records");
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRecord(fields) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateRecord(editingRecord.id, fields);
      setEditingRecord(null);
      setNotice(`Changes for weld ${updated.weldNo} saved.`);
    } finally {
      setSaving(false);
    }
  }

  function openFinal(record) {
    setFinalRecord(record);
    setFinalWelderId(record.welderId || "UNK");
  }

  function closeFinal() {
    setFinalRecord(null);
    finalPhoto.clear();
    setFinalWelderId("UNK");
  }

  async function saveFinal(event) {
    event.preventDefault();
    if (!finalPhoto.photo) {
      setError("Take or choose a final inspection photo.");
      return;
    }
    setSaving(true);
    setError("");
    const raw = new FormData(event.currentTarget);
    const fields = {
      lineNo: finalRecord.lineNo,
      weldNo: finalRecord.weldNo,
      finalDate: clean(raw.get("finalDate")),
      finalVtDate: clean(raw.get("finalVtDate")),
      finalWelderId,
    };

    try {
      await queueInspection(
        "final",
        fields,
        finalPhoto.photo,
        finalRecord._pendingClientId || null,
        finalRecord._pendingClientId ? null : finalRecord.id,
      );
      const weldNo = finalRecord.weldNo;
      closeFinal();
      await refreshPending();
      setNotice(`Final inspection for weld ${weldNo} saved on this phone — pending sync.`);
      setTab("records");
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <AppHeader recordCount={displayedRecords.length} />
      <div className="shell">
        <SyncStatus
          serverAvailable={serverAvailable}
          syncing={syncing}
          ready={ready}
          loading={loading}
          pending={pending}
          syncMessage={syncMessage}
          syncCode={syncCode}
          onRetry={retrySync}
        />
        {error && <div className="alert error">× {error}</div>}
        {notice && <div className="alert success">✓ {notice}</div>}
        <PwaUpdatePrompt busy={saving || syncing} />
        <AppTabs
          tab={tab}
          onChange={setTab}
          awaitingCount={awaiting.length}
          recordCount={displayedRecords.length}
        />

        {tab === "root" && (
          <InspectionForm
            type="root"
            formRef={formRef}
            preview={rootPhoto.preview}
            onPickPhoto={rootPhoto.pick}
            welderId={welderId}
            onWelderChange={setWelderId}
            welders={welders}
            onManageWelders={() => setManage(true)}
            onSubmit={saveRoot}
            onReset={resetRoot}
            saving={saving}
          />
        )}

        {tab === "final" && (
          <InspectionForm
            type="final-only"
            formRef={directFormRef}
            preview={directPhoto.preview}
            onPickPhoto={directPhoto.pick}
            welderId={directWelderId}
            onWelderChange={setDirectWelderId}
            welders={welders}
            onManageWelders={() => setManage(true)}
            onSubmit={saveDirect}
            onReset={resetDirect}
            saving={saving}
          />
        )}

        {tab === "awaiting" && (
          <section>
            <RecordSearch
              query={searchQuery}
              field={searchField}
              onQueryChange={setSearchQuery}
              onFieldChange={setSearchField}
              matchCount={filteredAwaiting.length}
              totalCount={awaiting.length}
            />
            <WeldRecords
              records={filteredAwaiting}
              loading={loading}
              emptyMessage={searching
                ? "No awaiting welds match your search."
                : "No welds are waiting for final inspection."}
              onFinal={openFinal}
              onEdit={setEditingRecord}
              onDelete={removeRecord}
            />
          </section>
        )}

        {tab === "records" && (
          <section>
            <ExportActions records={records} />
            <RecordSearch
              query={searchQuery}
              field={searchField}
              onQueryChange={setSearchQuery}
              onFieldChange={setSearchField}
              matchCount={filteredRecords.length}
              totalCount={displayedRecords.length}
              showExportNote
            />
            <WeldRecords
              records={filteredRecords}
              loading={loading}
              emptyMessage={searching ? "No weld records match your search." : "No weld records yet."}
              onFinal={openFinal}
              onEdit={setEditingRecord}
              onDelete={removeRecord}
            />
          </section>
        )}
      </div>

      <WelderManager
        open={manage}
        onClose={() => setManage(false)}
        welders={welders}
        onWeldersChange={setWelders}
        onError={setError}
      />
      {editingRecord && (
        <EditRecordModal
          key={editingRecord.id}
          record={editingRecord}
          welders={welders}
          onSave={saveRecord}
          onClose={() => setEditingRecord(null)}
          saving={saving}
          syncing={syncing}
        />
      )}
      {finalRecord && (
        <FinalInspectionModal
          record={finalRecord}
          welderId={finalWelderId}
          onWelderChange={setFinalWelderId}
          welders={welders}
          preview={finalPhoto.preview}
          onPickPhoto={finalPhoto.pick}
          onSubmit={saveFinal}
          onClose={closeFinal}
          saving={saving}
        />
      )}
    </main>
  );
}

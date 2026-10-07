import { useState } from "react";
import Field from "./Field.jsx";
import WelderSelect from "./WelderSelect.jsx";
import { clean } from "../utils/inspectionFields.js";

const dateValue = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";

export default function EditRecordModal({ record, welders, onSave, onClose, saving, syncing }) {
  const [welderId, setWelderId] = useState(record.welderId || "UNK");
  const [finalWelderId, setFinalWelderId] = useState(record.finalWelderId || "UNK");
  const [error, setError] = useState("");
  const hasRoot = Boolean(record.rootPhotoUrl);
  const hasFinal = Boolean(record.finalPhotoUrl);

  async function submit(event) {
    event.preventDefault();
    if (saving || syncing) return;
    setError("");
    const raw = new FormData(event.currentTarget);
    const names = ["lineNo", "weldNo"];
    if (hasRoot) names.push("rework", "rootDate", "rootVtDate");
    if (hasFinal) names.push("finalDate", "finalVtDate");
    const fields = Object.fromEntries(names.map((name) => [name, clean(raw.get(name))]));
    if (hasRoot) fields.welderId = welderId;
    if (hasFinal) fields.finalWelderId = finalWelderId;
    try {
      await onSave(fields);
    } catch (error) {
      setError(error.message || "Changes could not be saved. Please retry.");
    }
  }

  return (
    <div className="overlay">
      <form className="modal edit-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edit-record-title">
        <button type="button" className="close" onClick={onClose} disabled={saving} aria-label="Close edit form">×</button>
        <h2 id="edit-record-title">Edit weld record</h2>
        <p>Editing saved inspection details requires a server connection.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <fieldset disabled={saving}>
          <div className="fields">
            <Field label="Line number" name="lineNo" defaultValue={record.lineNo} />
            <Field label="Weld number" name="weldNo" defaultValue={record.weldNo} />
            {hasRoot && (
              <>
                <Field label="Rework" name="rework" defaultValue={record.rework} placeholder="e.g. R1" />
                <WelderSelect label="Root welder ID" value={welderId} onChange={setWelderId} welders={welders} />
                <Field label="Root date" name="rootDate" type="date" defaultValue={dateValue(record.rootDate)} />
                <Field label="Root VT date" name="rootVtDate" type="date" defaultValue={dateValue(record.rootVtDate)} />
              </>
            )}
            {hasFinal && (
              <>
                <WelderSelect label="Final welder ID" value={finalWelderId} onChange={setFinalWelderId} welders={welders} />
                <Field label="Final weld date" name="finalDate" type="date" defaultValue={dateValue(record.finalDate)} />
                <Field label="Final VT date" name="finalVtDate" type="date" defaultValue={dateValue(record.finalVtDate)} />
              </>
            )}
          </div>
        </fieldset>
        {syncing && <p role="status">Wait for the current sync to finish before saving changes.</p>}
        <div className="edit-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary" disabled={saving || syncing}>
            {saving ? "Saving…" : "✓ Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

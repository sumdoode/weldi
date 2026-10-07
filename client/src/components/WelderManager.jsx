import { useState } from "react";

export default function WelderManager({ open, onClose, welders, onWeldersChange, onError }) {
  const [editing, setEditing] = useState(null);
  const [code, setCode] = useState("");

  async function saveWelder() {
    if (!code.trim()) return;
    const url = editing ? `/api/welders/${editing}` : "/api/welders";
    const method = editing ? "PATCH" : "POST";
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        onError(response.ok ? "The server returned an invalid response." : `Could not save welder (${response.status}).`);
        return;
      }
      if (!response.ok) {
        onError(data.error || `Could not save welder (${response.status}).`);
        return;
      }
      const next = editing
        ? welders.map((welder) => welder.id === editing ? data.welder : welder)
        : [...welders, data.welder];
      onWeldersChange(next.sort((a, b) => a.code.localeCompare(b.code)));
      setCode("");
      setEditing(null);
    } catch (error) {
      onError(error.message || "Could not save welder.");
    }
  }

  async function removeWelder(id) {
    if (!confirm("Remove this welder ID? Existing records will not change.")) return;
    try {
      const response = await fetch(`/api/welders/${id}`, { method: "DELETE" });
      if (!response.ok) {
        let message = `Could not remove welder (${response.status}).`;
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {}
        onError(message);
        return;
      }
      onWeldersChange(welders.filter((welder) => welder.id !== id));
    } catch (error) {
      onError(error.message || "Could not remove welder.");
    }
  }

  // Keep the draft when the dialog closes, just as the original App did.
  if (!open) return null;

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <button className="close" onClick={onClose}>×</button>
        <h2>Welder IDs</h2>
        <p>Add, rename, or remove IDs shown in the form dropdown.</p>
        <div className="add">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="e.g. BK7963"
          />
          <button onClick={saveWelder}>{editing ? "Save" : "+ Add"}</button>
        </div>
        <div className="welder-list">
          {!welders.length ? (
            <p>No welder IDs yet.</p>
          ) : welders.map((welder) => (
            <div key={welder.id}>
              <strong>{welder.code}</strong>
              <button onClick={() => {
                setEditing(welder.id);
                setCode(welder.code);
              }}>✎</button>
              <button onClick={() => removeWelder(welder.id)}>⌫</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

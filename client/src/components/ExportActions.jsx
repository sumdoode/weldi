import { useMemo } from "react";
import createCsv from "../utils/createCsv.js";

export default function ExportActions({ records }) {
  // Exports only include records confirmed by the server.
  const csv = useMemo(() => createCsv(records), [records]);

  function download() {
    const url = URL.createObjectURL(csv);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = csv.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function downloadPdf() {
    window.location.href = "/api/export/pdf";
  }

  async function share() {
    if (navigator.canShare?.({ files: [csv] })) {
      try {
        await navigator.share({ title: "Weld Photo Log", files: [csv] });
      } catch (error) {
        if (error?.name !== "AbortError") download();
      }
    } else {
      download();
      location.href = "mailto:?subject=Weld%20Photo%20Log&body=Attach%20the%20downloaded%20CSV%20file.";
    }
  }

  return (
    <div className="export">
      <button onClick={download} disabled={!records.length}>↓ Export CSV</button>
      <button onClick={downloadPdf} disabled={!records.length}>▣ Export PDF + Photos</button>
      <button onClick={share} disabled={!records.length}>↗ Share / Email</button>
    </div>
  );
}

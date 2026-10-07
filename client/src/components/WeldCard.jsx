import Meta from "./Meta.jsx";

export default function WeldCard({ record, onFinal, onDelete }) {
  const complete = record.status === "COMPLETE";
  const status = record.syncStatus
    ? record.syncStatus === "failed" ? "SYNC FAILED" : "PENDING SYNC"
    : complete ? "COMPLETE" : "AWAITING FINAL";

  return (
    <article className={complete ? "complete" : ""}>
      <div className="photo-pair">
        <figure>
          {record.rootPhotoUrl ? (
            <img src={record.rootPhotoUrl} alt={`Root weld ${record.weldNo}`} />
          ) : (
            <div className="photo-placeholder">N/A</div>
          )}
          <figcaption>ROOT</figcaption>
        </figure>
        {record.finalPhotoUrl && (
          <figure>
            <img src={record.finalPhotoUrl} alt={`Final weld ${record.weldNo}`} />
            <figcaption>FINAL</figcaption>
          </figure>
        )}
      </div>
      <div>
        <span className="badge">{status}</span>
        <h3>Weld {record.weldNo}</h3>
        <dl>
          <Meta label="Line" value={record.lineNo} />
          <Meta label="Root welder" value={record.welderId} />
          <Meta label="Root date" value={record.rootDate} />
          <Meta label="Root VT" value={record.rootVtDate} />
          <Meta label="Final welder" value={record.finalWelderId || "UNK"} />
          <Meta label="Final date" value={record.finalDate || "UNK"} />
          <Meta label="Final VT" value={record.finalVtDate} />
          <Meta label="Rework" value={record.rework} />
        </dl>
        {onFinal && (
          <button className="add-final" onClick={onFinal}>
            + Add final inspection
          </button>
        )}
      </div>
      {onDelete && <button className="trash" onClick={onDelete}>⌫</button>}
    </article>
  );
}

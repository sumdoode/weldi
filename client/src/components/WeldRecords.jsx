import WeldCard from "./WeldCard.jsx";

export default function WeldRecords({ records, loading, emptyMessage, onFinal, onDelete }) {
  if (!records.length) {
    return <p className="empty">{loading ? "Loading…" : emptyMessage}</p>;
  }

  return (
    <div className="records">
      {records.map((record) => (
        <WeldCard
          key={record.id}
          record={record}
          onFinal={record.status !== "COMPLETE" ? () => onFinal(record) : null}
          onDelete={record.syncStatus ? null : () => onDelete(record.id)}
        />
      ))}
    </div>
  );
}

export default function SyncStatus({
  serverAvailable,
  syncing,
  ready,
  loading,
  pending,
  syncMessage,
  syncCode,
  onRetry,
}) {
  const connectionLabel = syncing
    ? "Connecting / syncing…"
    : serverAvailable
      ? "Server connected"
      : serverAvailable === null
        ? "Checking server…"
        : "Server unavailable";
  const storageLabel = !ready
    ? loading
      ? "Reading phone storage…"
      : "Phone storage unavailable"
    : pending.length
      ? `${pending.length} pending upload${pending.length === 1 ? "" : "s"}`
      : "All inspections synced";

  return (
    <>
      <div
        className={`connection ${serverAvailable ? "online" : "offline"}`}
        role="status"
      >
        <span>{connectionLabel}</span>
        <b>{storageLabel}</b>
        <button onClick={onRetry} disabled={syncing || !ready}>
          Sync now
        </button>
      </div>

      {pending.length > 0 && (
        <div className="sync-help">
          Keep this app open while syncing. It retries automatically (up to 60
          seconds between retries) and when you return to it. Do not clear
          website data.
        </div>
      )}

      {syncMessage && (
        <div className="alert error" role="alert">
          {syncMessage}
          {["auth", "unexpected-response"].includes(syncCode) && (
            <p>
              <a href="/api/health" target="_blank" rel="noreferrer">
                Open server / sign in again
              </a>
              , then return here and tap Sync now.
            </p>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <details className="pending-details">
          <summary>
            Pending uploads ({pending.length}) — show status / errors
          </summary>
          {pending.map((item) => (
            <div key={item.id}>
              <strong>
                {item.type.toUpperCase()} · Weld {item.fields?.weldNo || "UNK"}
              </strong>
              <span>
                {item.status === "syncing"
                  ? syncing
                    ? "Uploading…"
                    : "Waiting to retry"
                  : item.retryable === false
                    ? "Needs attention — tap Sync now to retry"
                    : "Saved on this device — waiting to sync"}
              </span>
              {item.error && <p>{item.error}</p>}
              <small>
                Request {item.id} · {item.attempts || 0} attempt(s)
              </small>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

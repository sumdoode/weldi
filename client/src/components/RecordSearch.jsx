export default function RecordSearch({
  query, field, onQueryChange, onFieldChange, matchCount, totalCount, showExportNote = false,
}) {
  return (
    <div className="record-search" role="search" aria-label="Search weld records">
      <div className="search-controls">
        <label>
          <span>Search records</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Weld number, welder ID, or line number"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Search by</span>
          <select value={field} onChange={(event) => onFieldChange(event.target.value)}>
            <option value="all">All fields</option>
            <option value="weldNo">Weld number</option>
            <option value="welder">Welder ID</option>
            <option value="lineNo">Line number</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => onQueryChange("")} disabled={!query}>
          Clear
        </button>
      </div>
      <p className="search-count" role="status">
        Showing {matchCount} of {totalCount} record{totalCount === 1 ? "" : "s"}
      </p>
      {showExportNote && query.trim() && (
        <p className="search-export-note">Exports include all synced records.</p>
      )}
    </div>
  );
}

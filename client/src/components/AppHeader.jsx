export default function AppHeader({ recordCount }) {
  return (
    <header>
      <div className="brand">
        <span className="logo">◉</span>
        <div>
          <h1>Weld Photo Log</h1>
          <small>Root and final inspection tracker · Sync fix 1.1.1</small>
        </div>
      </div>
      <b>{recordCount} welds</b>
    </header>
  );
}

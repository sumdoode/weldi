export default function AppTabs({ tab, onChange, awaitingCount, recordCount }) {
  const tabs = [
    { id: "root", label: "◉ Root" },
    { id: "final", label: "Final Only" },
    { id: "awaiting", label: `Awaiting (${awaitingCount})` },
    { id: "records", label: `Records (${recordCount})` },
  ];

  return (
    <nav className="four-tabs">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

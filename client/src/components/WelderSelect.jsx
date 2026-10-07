export default function WelderSelect({ label, value, onChange, welders, onManage }) {
  return (
    <label>
      <span>
        {label}
        {onManage && (
          <>
            {" "}
            <button type="button" className="link" onClick={onManage}>
              ⚙ Manage list
            </button>
          </>
        )}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="UNK">UNK — Unknown</option>
        {welders.map((welder) => (
          <option key={welder.id} value={welder.code}>
            {welder.code}
          </option>
        ))}
      </select>
    </label>
  );
}

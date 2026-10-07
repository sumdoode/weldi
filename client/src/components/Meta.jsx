export default function Meta({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={value === "UNK" ? "unknown" : ""}>{value}</dd>
    </div>
  );
}

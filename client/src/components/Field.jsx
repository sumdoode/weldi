export default function Field({ label, ...props }) {
  return (
    <label>
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

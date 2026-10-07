export default function PhotoInput({
  preview,
  onPick,
  label,
  alt,
  className = "photo",
  showHint = true,
}) {
  return (
    <label className={className}>
      {preview ? (
        <img src={preview} alt={alt} />
      ) : (
        <>
          <span className="camera">▣</span>
          <strong>{label}</strong>
          {showHint && <small>or choose one from your phone</small>}
        </>
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      {preview && <em>Tap to retake</em>}
    </label>
  );
}

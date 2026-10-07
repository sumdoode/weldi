const detailFields = [
  "lineNo", "weldNo", "rework", "welderId", "rootDate", "rootVtDate",
  "finalWelderId", "finalDate", "finalVtDate",
];

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

export function updateInspectionDetails(record, changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw invalid("Provide the inspection details to edit.");
  }
  const keys = Object.keys(changes);
  if (!keys.length || keys.some((key) => !detailFields.includes(key))) {
    throw invalid("Only inspection details can be edited.");
  }

  const hasRoot = Boolean(record.rootPhotoUrl || record.rootPhotoFilename);
  const hasFinal = Boolean(record.finalPhotoUrl || record.finalPhotoFilename);
  const rootFields = ["rework", "welderId", "rootDate", "rootVtDate"];
  const finalFields = ["finalWelderId", "finalDate", "finalVtDate"];
  const updated = { ...record };

  for (const key of keys) {
    if ((!hasRoot && rootFields.includes(key)) || (!hasFinal && finalFields.includes(key))) {
      throw invalid("Only recorded inspections can be edited.");
    }
    if (typeof changes[key] !== "string") {
      throw invalid("Inspection details must be text values.");
    }
    let value = changes[key].trim() || "UNK";
    if (key.endsWith("Date") && value !== "UNK") {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())
        || date.toISOString().slice(0, 10) !== value) {
        throw invalid("Use a valid date in YYYY-MM-DD format, or leave it blank.");
      }
    }
    if (key === "welderId" || key === "finalWelderId") value = value.toUpperCase();
    updated[key] = value;
  }

  return updated;
}

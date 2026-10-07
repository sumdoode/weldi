export const today = () => new Date().toISOString().slice(0, 10);

export const clean = (value) => String(value ?? "").trim() || "UNK";

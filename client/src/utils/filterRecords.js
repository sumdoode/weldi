const searchFields = {
  all: ["weldNo", "lineNo", "welderId", "finalWelderId"],
  weldNo: ["weldNo"],
  welder: ["welderId", "finalWelderId"],
  lineNo: ["lineNo"],
};

export default function filterRecords(records, query, field = "all") {
  const terms = String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return records;

  const fields = searchFields[field] || searchFields.all;
  return records.filter((record) => {
    const values = fields.map((key) => String(record[key] ?? "").toLowerCase());
    return terms.every((term) => values.some((value) => value.includes(term)));
  });
}

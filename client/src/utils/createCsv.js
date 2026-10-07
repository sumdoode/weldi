import { clean, today } from "./inspectionFields.js";

const columns = [
  ["LINE_NO", "lineNo"],
  ["WELD_NO", "weldNo"],
  ["ROOT_DATE", "rootDate"],
  ["ROOT_VT_DATE", "rootVtDate"],
  ["ROOT_WELDER_ID", "welderId"],
  ["FINAL_WELDER_ID", "finalWelderId"],
  ["DATE", "finalDate"],
  ["FINAL_VT_DATE", "finalVtDate"],
  ["REWORK", "rework"],
];

export default function createCsv(records) {
  const quote = (value) => `"${clean(value).replaceAll('"', '""')}"`;
  const headers = columns.map(([header]) => header).join(",");
  const rows = records.map((record) => columns
    .map(([, field]) => quote(record[field])).join(","));

  return new File(
    ["\ufeff" + headers + "\r\n" + rows.join("\r\n")],
    `weld-log-${today()}.csv`,
    { type: "text/csv;charset=utf-8" },
  );
}

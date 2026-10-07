import assert from "node:assert/strict";
import test from "node:test";
import createCsv from "../client/src/utils/createCsv.js";

const weld = {
  lineNo: "4196",
  weldNo: "4062",
  rootDate: "2026-10-06",
  rootVtDate: "2026-10-07",
  welderId: "BK7963",
  finalWelderId: "AB1234",
  finalDate: "2026-10-07",
  finalVtDate: "2026-10-07",
};

async function content(file) {
  return Buffer.from(await file.arrayBuffer()).toString("utf8");
}

test("CSV exports include the R designation for each weld", async () => {
  const csv = createCsv([{ ...weld, rework: "R1" }, { ...weld, rework: "R2" }]);
  const [headers, first, second] = (await content(csv)).split("\r\n");

  assert.equal(headers, "\ufeffLINE_NO,WELD_NO,ROOT_DATE,ROOT_VT_DATE,ROOT_WELDER_ID,FINAL_WELDER_ID,DATE,FINAL_VT_DATE,REWORK");
  assert.equal(first, '"4196","4062","2026-10-06","2026-10-07","BK7963","AB1234","2026-10-07","2026-10-07","R1"');
  assert.equal(second, '"4196","4062","2026-10-06","2026-10-07","BK7963","AB1234","2026-10-07","2026-10-07","R2"');
  assert.equal(csv.type, "text/csv;charset=utf-8");
  assert.match(csv.name, /^weld-log-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("CSV preserves N/A and uses UNK for blank or missing rework", async () => {
  const csv = createCsv([
    { ...weld, rework: "N/A" },
    { ...weld, rework: "   " },
    weld,
  ]);
  const rows = (await content(csv)).split("\r\n").slice(1);

  assert.deepEqual(rows.map((row) => row.split(",").at(-1)), ['"N/A"', '"UNK"', '"UNK"']);
});

test("CSV retains field escaping while including rework", async () => {
  const csv = createCsv([{ ...weld, weldNo: '4062,"A"\nB', rework: " R1 " }]);
  const exported = await content(csv);

  assert.ok(exported.includes('"4062,""A""\nB"'));
  assert.ok(exported.endsWith(',"R1"'));
});

import assert from "node:assert/strict";
import test from "node:test";
import filterRecords from "../client/src/utils/filterRecords.js";

const records = [
  { id: "root", weldNo: "4062", lineNo: "4196", welderId: "BK7963", finalWelderId: "AB1234" },
  { id: "final-only", weldNo: "4063", lineNo: "4200", welderId: "N/A", finalWelderId: "CD5678" },
  { id: "pending", weldNo: "7001", lineNo: "4196", welderId: "BK0001", syncStatus: "pending" },
];

const ids = (matches) => matches.map((record) => record.id);

test("record search finds partial weld and line numbers without changing record order", () => {
  assert.deepEqual(ids(filterRecords(records, "406")), ["root", "final-only"]);
  assert.deepEqual(ids(filterRecords(records, "419")), ["root", "pending"]);
});

test("welder search matches root and final welder IDs case-insensitively", () => {
  assert.deepEqual(ids(filterRecords(records, " bk ", "welder")), ["root", "pending"]);
  assert.deepEqual(ids(filterRecords(records, "ab12", "welder")), ["root"]);
  assert.deepEqual(ids(filterRecords(records, "cd5678")), ["final-only"]);
});

test("search by limits matches to the selected field", () => {
  assert.deepEqual(filterRecords(records, "4196", "weldNo"), []);
  assert.deepEqual(ids(filterRecords(records, "4196", "lineNo")), ["root", "pending"]);
  assert.deepEqual(filterRecords(records, "BK7963", "lineNo"), []);
});

test("combined search terms must all match the same record", () => {
  assert.deepEqual(ids(filterRecords(records, "4196   bk7963")), ["root"]);
  assert.deepEqual(filterRecords(records, "4196 cd5678"), []);
});

test("clearing search restores all records, including pending inspections", () => {
  assert.equal(filterRecords(records, ""), records);
  assert.equal(filterRecords(records, "   ", "welder"), records);
  assert.deepEqual(ids(filterRecords(records, "7001")), ["pending"]);
});

test("search safely handles numeric, missing, and literal punctuation values", () => {
  const unusual = [{ id: "numeric", weldNo: 4062 }, { id: "literal", weldNo: "W[1]" }, { id: "missing" }];
  assert.deepEqual(ids(filterRecords(unusual, "406")), ["numeric"]);
  assert.deepEqual(ids(filterRecords(unusual, "[1]")), ["literal"]);
  assert.deepEqual(filterRecords(unusual, "unmatched"), []);
});

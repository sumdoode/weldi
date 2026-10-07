import assert from "node:assert/strict";
import test from "node:test";
import { updateInspectionDetails } from "../server/weld-records.mjs";

const root = {
  id: "record-1", clientRequestId: "request-1", status: "AWAITING_FINAL",
  lineNo: "4196", weldNo: "4062", rework: "R1", welderId: "BK7963",
  rootDate: "2026-10-06", rootVtDate: "2026-10-07",
  finalWelderId: "UNK", finalDate: "UNK", finalVtDate: "UNK",
  rootPhotoUrl: "/uploads/root.png", rootPhotoFilename: "root.png",
  finalPhotoUrl: null, finalPhotoFilename: null,
  createdAt: "2026-10-07T10:00:00Z", completedAt: null,
};
const complete = {
  ...root, status: "COMPLETE", clientFinalRequestId: "final-request-1",
  finalPhotoUrl: "/uploads/final.png", finalPhotoFilename: "final.png",
  finalWelderId: "AB1234", finalDate: "2026-10-07", finalVtDate: "2026-10-07",
  completedAt: "2026-10-07T11:00:00Z",
};

test("edits preserve inspection photos, IDs, status, and untouched fields", () => {
  const updated = updateInspectionDetails(complete, {
    lineNo: " 7777 ", weldNo: "4063", rework: " R2 ",
    welderId: "bk1234", finalWelderId: "ab5678", finalDate: "2026-10-08",
  });
  assert.deepEqual(updated, {
    ...complete, lineNo: "7777", weldNo: "4063", rework: "R2",
    welderId: "BK1234", finalWelderId: "AB5678", finalDate: "2026-10-08",
  });
  assert.equal(complete.rework, "R1");
});

test("root edits retain awaiting-final status and normalize blank details", () => {
  const updated = updateInspectionDetails(root, { rework: "", rootDate: "   " });
  assert.equal(updated.status, "AWAITING_FINAL");
  assert.equal(updated.finalPhotoUrl, null);
  assert.equal(updated.rework, "UNK");
  assert.equal(updated.rootDate, "UNK");
  assert.throws(() => updateInspectionDetails(root, { finalDate: "2026-10-08" }), { status: 400 });
});

test("final-only edits preserve N/A root fields", () => {
  const finalOnly = {
    ...complete, rootPhotoUrl: null, rootPhotoFilename: null,
    rework: "N/A", welderId: "N/A", rootDate: "N/A", rootVtDate: "N/A",
  };
  const updated = updateInspectionDetails(finalOnly, { finalWelderId: "ab5678" });
  assert.equal(updated.finalWelderId, "AB5678");
  assert.equal(updated.rework, "N/A");
  assert.equal(updated.rootDate, "N/A");
  assert.throws(() => updateInspectionDetails(finalOnly, { rework: "R2" }), { status: 400 });
});

test("edits reject changes to record identity, photo paths, and workflow status", () => {
  for (const changes of [
    { id: "other-record" }, { clientRequestId: "other-request" },
    { rootPhotoFilename: "other.png" }, { finalPhotoUrl: "/uploads/other.png" },
    { status: "COMPLETE" }, { completedAt: "now" },
  ]) {
    assert.throws(() => updateInspectionDetails(root, changes), { status: 400 });
  }
});

test("edits validate dates and payloads before changing a record", () => {
  for (const date of ["2026-02-30", "2026-13-01", "10/07/2026", "invalid"]) {
    assert.throws(() => updateInspectionDetails(root, { rootDate: date }), { status: 400 });
  }
  for (const changes of [null, [], {}, { lineNo: 123 }, { rework: { code: "R1" } }]) {
    assert.throws(() => updateInspectionDetails(root, changes), { status: 400 });
  }
  assert.equal(updateInspectionDetails(root, { rootDate: "2028-02-29" }).rootDate, "2028-02-29");
});

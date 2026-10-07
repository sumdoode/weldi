import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { cacheAppData, cacheUpdatedRecord, getCachedAppData, getPending, putPending } from "../client/src/offlineDb.js";

test("edited records persist in the offline cache without changing welders or queued photos", async (t) => {
  const previousDb = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { globalThis.indexedDB = previousDb; });

  const first = { id: "first", weldNo: "4062", rework: "R1" };
  const second = { id: "second", weldNo: "4063", rework: "UNK" };
  const welders = [{ id: "welder-1", code: "BK7963" }];
  await cacheAppData({ records: [first, second], welders });
  await putPending({ id: "pending-1", type: "root", fields: { weldNo: "5000" },
    photo: new Blob(["pending photo bytes"], { type: "image/png" }) });

  const edited = { ...first, rework: "R2" };
  await cacheUpdatedRecord(edited);
  const cached = await getCachedAppData();
  assert.deepEqual(cached.records, [edited, second]);
  assert.deepEqual(cached.welders, welders);
  const pending = await getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "pending-1");
  assert.equal(await pending[0].photo.text(), "pending photo bytes");
});

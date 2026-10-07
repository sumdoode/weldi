import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { BrowserConnection, findChrome, startChrome } from "./helpers/browser.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const chromePath = await findChrome();

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

// Read actual IndexedDB entries after navigation/update; UI counts alone would
// not prove that pending photo bytes survived or that server sync committed.
const readPending = `new Promise((resolve, reject) => {
  const open = indexedDB.open('weld-photo-log', 2);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('syncQueue', 'readonly');
    const request = tx.objectStore('syncQueue').getAll();
    tx.oncomplete = () => { db.close(); resolve(request.result.map(item => ({
      id: item.id, type: item.type, targetClientId: item.targetClientId,
      weldNo: item.fields.weldNo, size: item.photo.size,
    }))); };
  };
})`;

test("PWA preserves offline inspections through updates, search, and record editing", {
  timeout: 120000,
  skip: !chromePath && "Install Chrome/Chromium or set CHROME_PATH to run the PWA integration test.",
}, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "weld-pwa-test-"));
  let chrome, backend, frontend, browser;
  t.after(async () => {
    browser?.close();
    await stopProcess(chrome);
    if (frontend) await new Promise((resolve) => frontend.close(resolve));
    await stopProcess(backend);
    await rm(directory, { recursive: true, force: true });
  });

  const generatedWorker = await readFile(path.join(project, "dist/sw.js"), "utf8");
  const legacyWorker = await readFile(new URL("./fixtures/legacy-sw.js", import.meta.url), "utf8");
  const photo = await readFile(path.join(project, "client/public/pwa-192x192.png"));
  const photoBase64 = photo.toString("base64");
  const assets = (await readdir(path.join(project, "dist/assets")))
    .filter((name) => /\.(js|css)$/.test(name)).map((name) => `/assets/${name}`);

  const portReservation = http.createServer();
  const backendPort = await listen(portReservation);
  await new Promise((resolve) => portReservation.close(resolve));
  backend = spawn(process.execPath, ["server/index.mjs"], {
    cwd: project,
    env: { ...process.env, PORT: String(backendPort),
      DATA_DIR: path.join(directory, "data"), UPLOAD_DIR: path.join(directory, "uploads") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    backend.stdout.on("data", (data) => { if (String(data).includes("server:")) resolve(); });
    backend.stderr.on("data", (data) => reject(new Error(String(data))));
    backend.once("error", reject);
    backend.once("exit", (code) => reject(new Error(`Server exited: ${code}`)));
  });

  let useLegacy = true;
  let offline = false;
  let allowUploads = false;
  frontend = http.createServer((request, response) => {
    if (offline) { request.socket.destroy(); return; }
    if (request.url.startsWith("/sw.js")) {
      response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      response.end(useLegacy ? legacyWorker : generatedWorker);
      return;
    }
    if (request.url === "/offline-assets.json") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(assets));
      return;
    }
    if (request.url === "/uploads/legacy-preview.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(photo);
      return;
    }
    if (!allowUploads && request.method === "POST" && request.url.startsWith("/api/")) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Test server temporarily unavailable" }));
      return;
    }
    const proxy = http.request({ hostname: "127.0.0.1", port: backendPort,
      path: request.url, method: request.method, headers: request.headers }, (proxied) => {
      response.writeHead(proxied.statusCode, proxied.headers);
      proxied.pipe(response);
    });
    proxy.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(proxy);
  });
  const origin = `http://127.0.0.1:${await listen(frontend)}`;

  const manifest = await fetch(`${origin}/manifest.webmanifest`).then((response) => response.json());
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((icon) => icon.sizes === `${size}x${size}`);
    assert.ok(icon, `Manifest includes a ${size}px icon`);
    const bytes = Buffer.from(await fetch(`${origin}${icon.src}`).then((response) => response.arrayBuffer()));
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }

  const endpoint = await startChrome(chromePath, path.join(directory, "chrome"), (child) => { chrome = child; });
  const debugOrigin = `http://${new URL(endpoint).host}`;
  const targets = await fetch(`${debugOrigin}/json/list`).then((response) => response.json());
  browser = await BrowserConnection.connect(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await browser.send("Page.enable");
  await browser.send("Network.enable");
  await browser.send("Page.navigate", { url: origin });
  await browser.waitFor("navigator.serviceWorker?.controller && document.querySelector('.connection button:not(:disabled)')");
  assert.ok(await browser.evaluate("caches.has('weld-photo-log-v3-sync-1-1-1')"));
  await browser.evaluate("fetch('/uploads/legacy-preview.png').then(response => response.arrayBuffer())");
  await browser.waitFor("caches.match('/uploads/legacy-preview.png').then(Boolean)");
  t.diagnostic("Installed the legacy worker and cached a historical photo preview.");

  async function setOffline(value) {
    offline = value;
    await browser.send("Network.emulateNetworkConditions", {
      offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
  }

  async function selectPhoto() {
    await browser.evaluate(`(() => {
      const bytes = Uint8Array.from(atob('${photoBase64}'), char => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'inspection.png', { type: 'image/png' }));
      const input = document.querySelector('input[type=file]');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await browser.waitFor("document.querySelector('.photo img')");
  }

  async function search(query, field = "all") {
    await browser.evaluate(`(() => {
      const select = document.querySelector('.record-search select');
      select.value = ${JSON.stringify(field)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const input = document.querySelector('.record-search input');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setValue.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }

  await setOffline(true);
  await browser.send("Page.reload", { ignoreCache: true });
  await browser.waitFor("document.querySelector('h1')?.textContent === 'Weld Photo Log' && document.querySelector('.connection button:not(:disabled)')");
  await browser.evaluate("document.querySelector('[name=lineNo]').value = '4196'; document.querySelector('[name=weldNo]').value = 'offline-root'");
  await selectPhoto();
  await browser.evaluate("document.querySelector('form').requestSubmit()");
  await browser.waitFor("document.querySelector('.add-final')");
  await search("no-matching-weld");
  await browser.waitFor("document.querySelector('.empty')?.textContent === 'No awaiting welds match your search.'");
  await browser.evaluate("document.querySelector('.record-search button').click()");
  await browser.waitFor("document.querySelector('.add-final')");
  await browser.evaluate("document.querySelector('.add-final').click()");
  await browser.waitFor("document.querySelector('.final-modal')");
  await selectPhoto();
  await browser.evaluate("document.querySelector('.final-modal').requestSubmit()");
  await browser.waitFor("!document.querySelector('.final-modal') && document.querySelector('.export')");
  await browser.evaluate("[...document.querySelectorAll('nav button')].find(button => button.textContent === 'Final Only').click()");
  await browser.waitFor("document.querySelector('[name=finalDate]') && document.querySelector('[name=weldNo]')");
  await browser.evaluate("document.querySelector('[name=lineNo]').value = '4196'; document.querySelector('[name=weldNo]').value = 'offline-final-only'");
  await selectPhoto();
  await browser.evaluate("document.querySelector('form').requestSubmit()");
  await browser.waitFor(`(${readPending}).then(items => items.length === 3)`);
  const before = await browser.evaluate(readPending);
  assert.deepEqual(before.map((item) => item.type).sort(), ["final", "final-only", "root"]);
  assert.ok(before.every((item) => item.size === photo.length));
  assert.equal(before.find((item) => item.type === "final").targetClientId, before.find((item) => item.type === "root").id);
  assert.ok(await browser.evaluate("[...document.querySelectorAll('.edit-record')].every(button => button.disabled)"));
  await search("OFFLINE-ROOT");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  assert.equal(await browser.evaluate("document.querySelector('.records h3').textContent"), "Weld offline-root");
  await search("4196", "lineNo");
  await browser.waitFor("document.querySelectorAll('.records article').length === 2");
  await search("4196", "weldNo");
  await browser.waitFor("document.querySelector('.empty')?.textContent === 'No weld records match your search.'");
  assert.equal(await browser.evaluate("document.querySelector('.search-count').textContent"), "Showing 0 of 2 records");
  await browser.evaluate("document.querySelector('.record-search button').click()");
  await browser.waitFor("document.querySelectorAll('.records article').length === 2");
  t.diagnostic("Offline search filters pending records and Awaiting entries, respects field selection, and clears correctly.");
  t.diagnostic("Saved root, paired final, and final-only photos while offline.");

  useLegacy = false;
  await setOffline(false);
  await browser.evaluate("navigator.serviceWorker.getRegistration().then(registration => registration.update())");
  await browser.waitFor("document.querySelector('.pwa-update') && [...document.querySelectorAll('.pwa-update button')].some(button => button.textContent === 'Update now' && !button.disabled)");
  assert.ok(await browser.evaluate("navigator.serviceWorker.getRegistration().then(registration => !!registration.waiting)"));
  assert.deepEqual(await browser.evaluate(readPending), before);
  await browser.evaluate("[...document.querySelectorAll('.pwa-update button')].find(button => button.textContent === 'Update now').click()");
  await browser.waitFor("document.querySelector('h1') && !document.querySelector('.pwa-update') && document.querySelector('.connection button:not(:disabled)')");
  await browser.waitFor("caches.keys().then(names => names.some(name => name.startsWith('workbox-precache')))");
  assert.deepEqual(await browser.evaluate(readPending), before);
  t.diagnostic("Activated the plugin-generated worker through the update prompt; pending photo bytes survived.");

  await setOffline(true);
  await browser.send("Page.navigate", { url: `${origin}/offline-navigation-test` });
  await browser.waitFor("document.querySelector('h1')?.textContent === 'Weld Photo Log' && document.querySelector('.connection button:not(:disabled)')");
  assert.deepEqual(await browser.evaluate(readPending), before);
  const preview = await browser.evaluate("fetch('/uploads/legacy-preview.png').then(async response => ({ type: response.headers.get('content-type'), size: (await response.arrayBuffer()).byteLength }))");
  assert.equal(preview.type, "image/png");
  assert.equal(preview.size, photo.length);
  const missingPhoto = await browser.evaluate("fetch('/uploads/missing.png').then(response => response.headers.get('content-type')).catch(() => null)");
  assert.ok(!missingPhoto?.includes("text/html"));
  const apiNavigation = await browser.send("Page.navigate", { url: `${origin}/api/health` });
  assert.ok(apiNavigation.errorText, "Offline API navigation must fail instead of returning the app shell");
  t.diagnostic("Plugin worker supports offline navigation and historical previews without intercepting API routes.");

  allowUploads = true;
  await setOffline(false);
  await browser.send("Page.navigate", { url: origin });
  await browser.waitFor(`document.querySelector('h1') && (${readPending}).then(items => items.length === 0)`);
  const records = await fetch(`${origin}/api/welds`).then((response) => response.json());
  assert.equal(records.records.length, 2);
  assert.ok(records.records.every((record) => record.status === "COMPLETE"));
  assert.equal((await readdir(path.join(directory, "uploads"))).length, 3);
  t.diagnostic("All three queued photos synced to the isolated real server after reconnecting.");

  const original = records.records.find((record) => record.weldNo === "offline-root");
  const originalFiles = (await readdir(path.join(directory, "uploads"))).sort();
  // Existing IDs remain editable even when removed from the managed welder list.
  const response = await fetch(`${origin}/api/welds/${original.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ welderId: "REMOVED123", finalWelderId: "FINAL789" }),
  });
  assert.ok(response.ok, "PATCH should update the existing weld record");
  await browser.send("Page.reload");
  await browser.waitFor("document.querySelector('.connection button:not(:disabled)')");
  await browser.evaluate("[...document.querySelectorAll('nav button')].find(button => button.textContent.startsWith('Records')).click()");
  await browser.waitFor("document.querySelector('.edit-record:not(:disabled)')");
  await browser.evaluate("[...document.querySelectorAll('.records article')].find(card => card.querySelector('h3').textContent === 'Weld offline-root').querySelector('.edit-record').click()");
  await browser.waitFor("document.querySelector('.edit-modal')");
  assert.equal(await browser.evaluate("document.querySelector('.edit-modal select').value"), "REMOVED123");
  await browser.evaluate(`(() => {
    const fields = { lineNo: '7777', weldNo: 'edited-root', rework: 'R2',
      rootDate: '2026-10-07', rootVtDate: '2026-10-07',
      finalDate: '2026-10-08', finalVtDate: '2026-10-08' };
    for (const [name, value] of Object.entries(fields)) {
      document.querySelector('.edit-modal [name=' + name + ']').value = value;
    }
    document.querySelector('.edit-modal').requestSubmit();
  })()`);
  await browser.waitFor("!document.querySelector('.edit-modal') && [...document.querySelectorAll('.records h3')].some(heading => heading.textContent === 'Weld edited-root')");
  const edited = await fetch(`${origin}/api/welds`).then((response) => response.json())
    .then((data) => data.records.find((record) => record.id === original.id));
  assert.equal(edited.lineNo, "7777");
  assert.equal(edited.rework, "R2");
  assert.equal(edited.welderId, "REMOVED123");
  assert.equal(edited.finalDate, "2026-10-08");
  assert.equal(edited.status, original.status);
  assert.equal(edited.rootPhotoUrl, original.rootPhotoUrl);
  assert.equal(edited.finalPhotoUrl, original.finalPhotoUrl);
  assert.equal(edited.createdAt, original.createdAt);
  assert.deepEqual((await readdir(path.join(directory, "uploads"))).sort(), originalFiles);

  await search("7777", "lineNo");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  await search("edited", "weldNo");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  await search("removed123", "welder");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  await search("final789", "welder");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  assert.equal(await browser.evaluate("document.querySelector('.records h3').textContent"), "Weld edited-root");
  assert.equal(await browser.evaluate("document.querySelector('.search-count').textContent"), "Showing 1 of 2 records");

  // Capture the actual Export CSV file without downloading it to a user folder.
  await browser.evaluate(`(() => {
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = (file) => {
      if (file instanceof File && file.name.endsWith('.csv')) window.exportedCsv = file;
      return createObjectURL(file);
    };
    HTMLAnchorElement.prototype.click = () => {};
    document.querySelector('.export button').click();
  })()`);
  const exported = await browser.evaluate("window.exportedCsv.text()");
  assert.ok(exported.includes("REWORK"));
  assert.ok(exported.includes('"7777","edited-root"'));
  assert.ok(exported.includes(',"R2"'));
  assert.ok(exported.includes('"offline-final-only"'), "Search does not silently limit exports");

  await setOffline(true);
  await browser.send("Page.reload");
  await browser.waitFor("document.querySelector('.connection button:not(:disabled)')");
  await browser.evaluate("[...document.querySelectorAll('nav button')].find(button => button.textContent.startsWith('Records')).click()");
  await browser.waitFor("[...document.querySelectorAll('.records h3')].some(heading => heading.textContent === 'Weld edited-root')");
  await search("FINAL789", "welder");
  await browser.waitFor("document.querySelectorAll('.records article').length === 1");
  assert.equal(await browser.evaluate("document.querySelector('.records h3').textContent"), "Weld edited-root");
  await browser.evaluate("document.querySelector('.record-search button').click()");
  await browser.waitFor("document.querySelectorAll('.records article').length === 2");
  await browser.evaluate("[...document.querySelectorAll('.records article')].find(card => card.querySelector('h3').textContent === 'Weld edited-root').querySelector('.edit-record').click()");
  await browser.waitFor("document.querySelector('.edit-modal')");
  assert.equal(await browser.evaluate("document.querySelector('.edit-modal [name=rework]').value"), "R2");
  await browser.evaluate("document.querySelector('.edit-modal [name=weldNo]').value = 'unsaved-offline-edit'; document.querySelector('.edit-modal').requestSubmit()");
  await browser.waitFor("document.querySelector('.edit-modal [role=alert]')");
  assert.equal(await browser.evaluate("document.querySelector('.edit-modal [name=weldNo]').value"), "unsaved-offline-edit");
  await browser.evaluate("document.querySelector('.edit-modal .secondary').click()");
  assert.ok(await browser.evaluate("[...document.querySelectorAll('.records h3')].some(heading => heading.textContent === 'Weld edited-root')"));
  t.diagnostic("Record edits survive offline reloads, appear in CSV exports, and retain draft values after a failed save.");

  await setOffline(false);
  await browser.send("Page.reload");
  await browser.waitFor("document.querySelector('.connection button:not(:disabled)')");
  await browser.evaluate("[...document.querySelectorAll('nav button')].find(button => button.textContent.startsWith('Records')).click()");
  await browser.waitFor("document.querySelector('.edit-record:not(:disabled)')");
  await browser.evaluate("[...document.querySelectorAll('.records article')].find(card => card.querySelector('h3').textContent === 'Weld offline-final-only').querySelector('.edit-record').click()");
  await browser.waitFor("document.querySelector('.edit-modal')");
  assert.equal(await browser.evaluate("document.querySelector('.edit-modal [name=rootDate]')"), null);
  await browser.evaluate("document.querySelector('.edit-modal [name=finalDate]').value = '2026-10-09'; document.querySelector('.edit-modal').requestSubmit()");
  await browser.waitFor("!document.querySelector('.edit-modal')");
  const finalOnly = await fetch(`${origin}/api/welds`).then((response) => response.json())
    .then((data) => data.records.find((record) => record.weldNo === "offline-final-only"));
  assert.equal(finalOnly.finalDate, "2026-10-09");
  assert.equal(finalOnly.rootDate, "N/A");
  assert.equal(finalOnly.rework, "N/A");

  const unknown = await fetch(`${origin}/api/welds/missing-record`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rework: "R1" }),
  });
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error, "Weld record not found.");
  t.diagnostic("Final-only edits retain N/A root fields; missing records return a JSON error.");
});

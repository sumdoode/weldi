# Weld Photo Log

A platform-independent mobile weld photo tracker built with React, Vite, Express, and local file storage.

The app is an installable Progressive Web App (PWA). Inspection fields and photo bytes are first saved in IndexedDB on the phone, then uploaded when the app is open and the server is reachable. Version 1.1.1 includes the foreground retry/storage improvements from 1.1 and corrects retry handling for incomplete multipart uploads (`Unexpected end of form`). The status bar distinguishes server reachability from the phone's internet connection.

**Upgrading with pending photos? Read [UPGRADE-SYNC-FIX.md](UPGRADE-SYNC-FIX.md) first. Do not clear website data or change the app address.**

## Requirements

- Node.js 22.12+ (22.x), or 24+; Node 24 is a suitable choice. Node 21 is not supported.
- npm

## Run locally

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run:

   npm ci

4. Start the frontend and server:

   npm run dev

5. Open http://localhost:5173

`vite-plugin-pwa` generates the service worker, offline asset cache, and `manifest.webmanifest` from `vite.config.js`. The service worker is enabled in production builds, not Vite development. To test offline app loading on the computer, run `npm run build`, then `npm start` and open http://localhost:3001 while online first. On a phone, use your HTTPS deployment and the same browser/PWA that holds your records. Installation is optional; for a new installation on iPhone use **Share → Add to Home Screen** while online. Do not reinstall an existing app to fix pending uploads.

When a new version is ready, the app shows **Update now** and **Later**. Save any inspection in progress before updating; updating reloads the app. The update button is disabled during inspection saving and upload syncing. Existing IndexedDB records and queued photos are retained, and the worker remains at `/sw.js` with the same root scope for existing installations.

Plain HTTP on a local Wi-Fi IP does not provide full service-worker/PWA support. Also, `localhost` on the phone means the phone, not your computer. If using the computer as a server, it must stay running on the same Wi-Fi as the phone; switching the phone to cellular cannot normally reach that local server.

Records are stored in `server/data/db.json`. Photos are stored in `server/uploads/`.

## Production

Build and start:

   npm ci
   npm run build
   npm start

The server uses `PORT` when supplied and defaults to port 3001. Set `DATA_DIR` and `UPLOAD_DIR` to paths on persistent storage when deploying.

Your host must provide persistent disk storage or the records/photos can be lost after a redeploy. Use HTTPS for phone/PWA deployment. This app has no Cloudflare dependencies and no built-in login; an existing authentication proxy must continue protecting the API and uploads as well as the frontend. Do not expose the application port publicly to bypass the proxy.

## Offline behavior

- Root, paired final, and final-only inspections can be saved without internet.
- Saving waits for the IndexedDB transaction to commit, with photo bytes stored as a Blob. Existing version-2 queue entries and request IDs are preserved.
- Pending photos and fields remain in the queue until the server confirms that specific inspection and photo. The confirmation is cached and the pending item removed in one transaction.
- While the app is visible, retryable failures are retried after 10, 20, 40, then at most 60 seconds. Coming back to the app, focusing it, or adding an inspection also triggers a check. **Sync now** forces a manual retry, even when the browser reports offline.
- The app cannot promise uploads while the phone is locked or the app/browser is closed. Reopen the same app, keep it visible, and wait for zero pending uploads.
- A failed root blocks its dependent final, but a permanent problem with one weld does not block unrelated welds. Network and sign-in errors pause the batch. Sign-in, validation, or unreadable-photo errors require attention and then **Sync now**.
- An incomplete upload stays pending and automatically retries with fresh FormData and the same request ID. It does not block unrelated welds. Entries marked failed by version 1.1 for this exact error are eligible for automatic retry again; other HTTP 400 errors are not reclassified.
- The server returns `UPLOAD_INCOMPLETE` for unfinished multipart uploads and logs a request ID for troubleshooting without photo contents, form fields, or authentication headers. A repeated incomplete upload still needs its underlying connection/browser/proxy cause investigated; retry handling alone cannot guarantee a broken transport will recover.
- The app allows photos up to 15 MB; a host/proxy may impose a lower limit. No lossy recompression is performed when saving or uploading.
- Expand **Pending uploads** for the exact error, request ID, and attempt count. A network error does not remove the photo. A photo whose original bytes have already become unreadable cannot be reconstructed by a code update.
- CSV and PDF exports include server-synchronized records only. Wait until the pending count reaches zero before exporting.
- Do not clear the browser's site data or remove the installed PWA while inspections are pending.
- Browser storage is not a backup: the browser/OS can remove site storage. Keep the original camera photos where practical and back up server data and uploads. Previously synced photo previews are only available offline if cached; server synchronization is not a download of every historical photo.
- **Search records** on Records or Awaiting filters by weld number, line number, or either root/final welder ID. Choose **Search by** to limit the field, or use **All fields** to combine terms (for example, `4196 BK7963`). Matching is partial and case-insensitive, works offline, and includes pending inspections. **Clear** restores the full list. Exports include all synced records regardless of the search.
- **Edit** opens the saved inspection details on records and awaiting-final cards. You can correct line/weld numbers, rework, welder IDs, and dates. Existing photos and inspection status are retained. Successful edits update the server and the offline record cache, and subsequent exports include the corrected values. Records with pending uploads must finish syncing before they can be edited.
- Welder-list changes, editing, and deletion of server records require a connection; only inspection creation/completion is queued offline.

## Client code structure

- `client/src/App.jsx` coordinates tabs, inspection saves, and dialog visibility.
- `client/src/components/` contains the inspection forms, shared inputs, sync status, record cards, exports, and welder dialog.
- `client/src/components/PwaUpdatePrompt.jsx` uses the plugin's React registration hook to show app updates.
- `client/src/hooks/useWeldData.js` loads cached/server data and manages foreground sync.
- `client/src/hooks/useDisplayedRecords.js` combines pending inspections with server records for display.
- `client/src/hooks/useInspectionPhoto.js` manages selected photos and preview URL cleanup.
- `client/src/utils/inspectionFields.js` holds the shared date and field formatting helpers.

## Verification

```sh
npm ci
npm run build
npm test
```

The PWA integration test uses the production build, an isolated Chrome/Chromium profile, and temporary server data. It checks installation of the released custom worker, migration through the plugin's update prompt, offline navigation, cached photo previews, API route exclusions, and preservation of queued root, paired final, and final-only photos until the real server confirms them after reconnecting. It also checks the generated manifest and PNG icon sizes. Your application data and normal browser profile are not used.

Install Chrome/Chromium to run the browser test. Set `CHROME_PATH` if the executable is not in one of the standard macOS/Linux locations; without a browser, the test reports skipped. Browser automation does not replace a physical iPhone test with your hosting/proxy setup.

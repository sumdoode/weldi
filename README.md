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

The service worker is enabled in production builds, not Vite development. To test offline app loading on the computer, run `npm run build`, then `npm start` and open http://localhost:3001 while online first. On a phone, use your HTTPS deployment and the same browser/PWA that holds your records. Installation is optional; for a new installation on iPhone use **Share → Add to Home Screen** while online. Do not reinstall an existing app to fix pending uploads.

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
- Welder-list changes and deletion of server records require a connection; only inspection creation/completion is queued offline.

## Verification

```sh
npm ci
npm run build
npm test
```

The regression suite covers scheduling, transaction commit/abort behavior using fake-indexeddb, old queue compatibility, multipart photo preservation, login/timeouts, and real-server duplicate-safe retries using temporary test data. It reproduces `Unexpected end of form` and deliberately cuts uploads inside a photo, then checks timed retries for root, final-only, and both paired-final endpoints, including a lost server acknowledgement. Partial and duplicate files must be cleaned up, while local records remain pending until confirmation. The real-server tests also check the built production assets. These tests do not replace a physical iPhone test with your hosting/proxy setup; follow the checklist in UPGRADE-SYNC-FIX.md.

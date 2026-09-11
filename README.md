# Weld Photo Log

A platform-independent mobile weld photo tracker built with React, Vite, Express, and local file storage.

The app is an installable Progressive Web App (PWA). Inspection forms and photos are first saved in IndexedDB on the phone, then synchronized with the server automatically when a connection is available. The status bar shows Online/Offline and the number of pending uploads.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

1. Open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run:

   npm install

4. Start the frontend and server:

   npm run dev

5. Open http://localhost:5173

Service workers require a production build (or HTTPS). To test installation and offline app loading locally, run `npm run build`, then `npm start` and open http://localhost:3001. On iPhone, deploy over HTTPS, open the app in Safari, then choose **Share → Add to Home Screen**.

Records are stored in `server/data/db.json`. Photos are stored in `server/uploads/`.

## Production

Build and start:

   npm install
   npm run build
   npm start

The server uses `PORT` when supplied and defaults to port 3001. Set `DATA_DIR` and `UPLOAD_DIR` to paths on persistent storage when deploying.

Your host must provide persistent disk storage or the records/photos will be lost after a redeploy. Camera capture on phones requires HTTPS in production.

## Offline behavior

- Root, paired final, and final-only inspections can be saved without internet.
- Pending photos and fields remain on that device until synchronization succeeds.
- When the app is open, it retries automatically after the connection returns. **Sync now** allows a manual retry.
- CSV and PDF exports include server-synchronized records only. Wait until the pending count reaches zero before exporting.
- Do not clear the browser's site data or remove the installed PWA while inspections are pending.

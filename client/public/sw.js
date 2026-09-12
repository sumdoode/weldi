const CACHE = "weld-photo-log-v3-sync-1-1-1";
const SHELL = ["/", "/manifest.webmanifest", "/weld-icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const manifest = await fetch("/offline-assets.json", { cache: "no-store" });
    if (!manifest.ok || manifest.redirected) throw new Error("Could not load offline asset list.");
    const assets = await manifest.json();
    if (!Array.isArray(assets) || assets.some(path => !/^\/assets\/[\w.-]+\.(js|css)$/.test(path))) {
      throw new Error("Invalid offline asset list.");
    }
    const cache = await caches.open(CACHE);
    await Promise.all([...SHELL, ...assets].map(async path => {
      const response = await fetch(path, { cache: "no-store" });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || response.redirected || (path.endsWith(".js") && !type.includes("javascript")) || (path.endsWith(".css") && !type.includes("text/css"))) {
        throw new Error("An offline asset is unavailable or sign-in is required.");
      }
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  // Keep old shell assets for already-open tabs. Never clear IndexedDB or
  // caches owned by another app; navigation uses the new shell first.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/offline-assets.json") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(event.request, { signal: controller.signal });
      if (response.ok && !response.redirected) {
        try { await cache.put(event.request, response.clone()); } catch { /* Cache quota must not block an online response. */ }
      }
      return response;
    } catch {
      const cached = await cache.match(event.request) || await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return await cache.match("/") || new Response("Open the app online once to enable offline use.", { status: 503 });
      return new Response("Offline", { status: 503, statusText: "Offline" });
    } finally { clearTimeout(timer); }
  })());
});

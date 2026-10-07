import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "client",
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      filename: "sw.js",
      scope: "/",
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["weld-icon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Weld Photo Log",
        short_name: "Weld Log",
        description: "Offline-ready root and final weld inspection tracker",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f1f5f9",
        theme_color: "#0f172a",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "/weld-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/uploads(?:\/|$)/],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.origin === self.location.origin
            && url.pathname.startsWith("/uploads/"),
          handler: "NetworkFirst",
          options: {
            cacheName: "weld-photo-log-photos",
            networkTimeoutSeconds: 8,
            plugins: [{
              cacheWillUpdate: async ({ response }) => response.status === 200
                && !response.redirected ? response : null,
              // Reuse photo previews cached by the previous custom worker.
              handlerDidError: async ({ request }) => caches.match(request),
            }],
          },
        }],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001", "/uploads": "http://localhost:3001" }
  },
  build: { outDir: "../dist", emptyOutDir: true }
});

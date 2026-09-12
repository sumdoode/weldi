import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react(), {
    name: "offline-shell-assets",
    apply: "build",
    generateBundle(_options, bundle) {
      // Cache the exact built JS/CSS before the new worker takes control.
      const assets = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `/${name}`);
      this.emitFile({ type: "asset", fileName: "offline-assets.json", source: JSON.stringify(assets) });
    }
  }],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001", "/uploads": "http://localhost:3001" }
  },
  build: { outDir: "../dist", emptyOutDir: true }
});

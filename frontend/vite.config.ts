import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// __DEV_INSTANCE__ gates the DEV banner / forced blur / redaction. True under
// `vite` dev, or when building for this workspace's own instance
// (DEV_INSTANCE=1, see build:dev-frontend). The Docker release build sets
// neither, so all of it is stripped from what ships.
export default defineConfig(({ mode }) => ({
  define: { __DEV_INSTANCE__: String(mode === "development" || process.env.DEV_INSTANCE === "1") },
  plugins: [tailwindcss()],
  root: import.meta.dirname,
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:8787",
    },
    allowedHosts: [".slashdir.net"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Vite's default target predates top-level await; this is a self-hosted,
    // single-user tool with no legacy-browser requirement, so es2022 (which
    // main.ts's onboarding check relies on) is a safe minimum.
    target: "es2022",
  },
}));

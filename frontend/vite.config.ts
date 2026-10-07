import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
});

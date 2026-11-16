import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

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
    target: "es2022",
  },
}));

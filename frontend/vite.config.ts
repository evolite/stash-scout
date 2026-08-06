import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
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
  },
});

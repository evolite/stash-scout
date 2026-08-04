import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

import { defineConfig } from "vite";
export default defineConfig({
  base: "/tools/",
  build: { target: "es2022", sourcemap: false },
  server: {
    host: "127.0.0.1",
    proxy: { "/tools-api": "http://127.0.0.1:4174" },
  },
  preview: { proxy: { "/tools-api": "http://127.0.0.1:4174" } },
});

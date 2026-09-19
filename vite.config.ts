import { defineConfig } from "vite";
export default defineConfig({
  base: "/tools/",
  build: { target: "es2022", sourcemap: false },
  server: { host: "127.0.0.1" },
});

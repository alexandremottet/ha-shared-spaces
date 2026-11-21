import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: { fs: { allow: ["../.."] } },
  test: { include: ["src/**/*.test.ts"] },
});

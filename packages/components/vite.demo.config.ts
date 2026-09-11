import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "demo"),
  esbuild: {
    jsx: "automatic",
  },
});

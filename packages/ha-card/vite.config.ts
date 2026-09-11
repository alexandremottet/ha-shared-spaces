import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: resolve(__dirname, "../../custom_components/share_space/frontend"),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "components.js",
      name: "ShareSpaceFrontend",
    },
  },
});

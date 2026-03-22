import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/vector-file-search/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        medteria: resolve(__dirname, "medteria.html")
      }
    }
  }
});

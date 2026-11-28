/** Builds the public ESM entry and compiled stylesheet with shared runtime dependencies. */
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react(), tailwind()],
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        index: "src/index.ts",
        styles: "src/globals.css",
      },
      formats: ["es"],
      cssFileName: "styles",
    },
    rolldownOptions: {
      external: [
        /^@shadcn\/react(?:\/|$)/,
        /^react(?:\/|$)/,
        /^react-dom(?:\/|$)/,
        "class-variance-authority",
        "cmdk",
        "cn",
        "lucide-react",
        "radix-ui",
      ],
    },
  },
});

/** Bundles React-independent ESM entry points and the ready-to-use stylesheet. */
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
        button: "src/foundation/button/button.tsx",
        styles: "src/globals.css",
      },
      formats: ["es"],
      cssFileName: "styles",
    },
    rollupOptions: {
      external: [/^react(?:\/|$)/, /^react-dom(?:\/|$)/, "radix-ui", "lucide-react", "cn"],
    },
  },
});

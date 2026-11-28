/** Runs public-package integration scenarios against a production catalog build. */
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 3,
  use: {
    baseURL: "http://127.0.0.1:5198",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter chulane_ui build && pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 5198 --strictPort",
    url: "http://127.0.0.1:5198",
    reuseExistingServer: false,
  },
});

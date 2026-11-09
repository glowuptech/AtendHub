import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/editor-harness",
  testMatch: "**/*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "node tests/editor-harness/server.mjs",
    url: "http://127.0.0.1:4173/tests/editor-harness/index.html",
    timeout: 60000,
  },
});

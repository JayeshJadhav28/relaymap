import { defineConfig } from "@playwright/test";

/**
 * Browser regression suite.
 *
 * Uses the locally installed Microsoft Edge channel so no browser download is
 * required in this environment. By default the dev server is reused when it is
 * already running on port 3000 (the normal local demo path).
 *
 * Set PLAYWRIGHT_BASE_URL (for example http://localhost:3001) to run the same
 * suite against an already-running production build. No web server is started
 * in that mode.
 */
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results/browser",
  use: {
    baseURL,
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev --port 3000",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

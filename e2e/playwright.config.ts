// Playwright's settings for the browser end-to-end tests (T411): Chromium only, against a stack that
// is already running (`docker compose up --build`); the addresses come from E2E_* variables so the
// same specs run against the demo ports or a second stack on other ports.
import { defineConfig, devices } from "@playwright/test";
import { URLS } from "./support/urls.js";

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./specs",
  // A journey waits for the worker (matching, deadlines, retries), so a test gets minutes, not seconds.
  timeout: 3 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Two browsers at once fit the 2-core runner; the journeys share the stack, so more adds only noise.
  workers: 2,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: URLS.web,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Signs each demo role in once through the login page and keeps its cookie for the specs.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /storage-outage\.spec\.ts/,
    },
    // Puts storage into an outage, which would break any upload running beside it, so it runs alone,
    // after everything else.
    {
      name: "storage-outage",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium"],
      testMatch: /storage-outage\.spec\.ts/,
    },
  ],
});

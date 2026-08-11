import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // Prefer env so we never hardcode :3000 (Wasp client often uses 3000; set explicitly).
    // Client UI port (Vite). Server API is separate (often 3011).
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * `webServer` field tells Playwright how to run the app (webServer) it tests.
   * It seems however that there is a bug in Playwright that keeps the web server open after running tests locally https://github.com/microsoft/playwright/issues/11907,
   * causing errors when trying to run `wasp start` afterwards. To avoid this, we let Playwright run web server only in CI (where this is not a problem because after tests we don't do anything else).
   * For local development, where this does pose a nuisance, we start the app / web server manually with `wasp db start` and `wasp start` and then start tests with `npm run local:e2e:start`.
   */
  // Prefer an already-running `wasp start` (reuseExistingServer).
  webServer: process.env.CI
    ? {
        command: "cd ../app && wasp start",
        url: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
        reuseExistingServer: false,
        timeout: 180 * 1000,
      }
    : undefined,
});

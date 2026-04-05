import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for __PROJECT_NAME__.
 *
 * Framework: __FRAMEWORK__
 * Language: __LANGUAGE__
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./src/specs",
  testMatch: "**/*.spec.ts",

  /* Run tests in parallel across files */
  fullyParallel: true,

  /* Fail the build on CI if test.only is left in source */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests on CI for flake resilience */
  retries: process.env.CI ? 2 : 0,

  /* Limit parallel workers on CI to avoid resource contention */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter configuration */
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["html", { open: "on-failure" }]],

  /* Shared settings for all projects */
  use: {
    /* Base URL for navigation actions */
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",

    /* Collect trace on first retry for debugging */
    trace: "on-first-retry",

    /* Capture screenshot on failure */
    screenshot: "only-on-failure",

    /* Record video on first retry */
    video: "on-first-retry",
  },

  /* Browser configurations */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
});

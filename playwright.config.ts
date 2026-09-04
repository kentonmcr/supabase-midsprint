import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file — same .env.local Next.js itself
 * reads (see CLAUDE.md's Environment section), so PLAYWRIGHT_TEST_EMAIL /
 * PLAYWRIGHT_TEST_PASSWORD are available to tests without duplicating them
 * into a second file.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env.local'), quiet: true });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Playwright's 5s default is tight against `next dev` (Turbopack
   * compiles routes on demand) plus real round trips to the live Supabase
   * project, especially once several e2e tests have run back-to-back in
   * the same invocation — seen as intermittent toBeVisible() timeouts
   * that don't reproduce when the same test runs alone. Not a sleep or
   * networkidle wait; just a more realistic ceiling for this environment. */
  expect: {
    timeout: 10000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Chromium only. This machine is on macOS 13 (arm64), which the
   * Playwright-managed Chromium build no longer supports installing —
   * `channel: 'chrome'` runs tests against the system-installed Google
   * Chrome instead of downloading Playwright's own browser binary. */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Run the local dev server before starting the tests; reuses one that's
   * already running instead of starting a second (and never stops a
   * server it didn't start). */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});

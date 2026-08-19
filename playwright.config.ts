import { defineConfig, devices } from '@playwright/test';

const adminStorageState = process.env.E2E_STORAGE_STATE || 'playwright/.auth/admin.json';
const hasAdminCreds = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The html reporter writes its output ONLY when the run finishes, so a suite
  // killed by the job's `timeout-minutes` produces no report and no failure text
  // whatsoever — the 2026-08-19 nightly died at 45m and uploaded nothing but
  // "No files were found with the provided path: playwright-report/", leaving 21
  // failures and 4 timeouts unreadable. `list` streams each result to stdout as
  // it completes, so the job log stays a usable record even when the run is cut
  // off mid-suite. Keep both: list for the log, html for the artifact.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://queer.guide',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(hasAdminCreds || process.env.E2E_STORAGE_STATE
          ? { storageState: adminStorageState }
          : {}),
      },
      dependencies: hasAdminCreds ? ['setup'] : [],
    },
    // P2-3 — mobile viewport project. Run with `--project=mobile`.
    // Uses Chromium (already installed for the main suite) at iPhone 13's
    // viewport + DPR, so we don't need to download WebKit just for screenshots.
    {
      name: 'mobile',
      testMatch: /visual-mobile\.spec\.ts$/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      },
    },
  ],
});

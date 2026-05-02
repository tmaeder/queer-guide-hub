import { defineConfig, devices } from '@playwright/test';

const adminStorageState = process.env.E2E_STORAGE_STATE || 'playwright/.auth/admin.json';
const hasAdminCreds = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
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
  ],
});

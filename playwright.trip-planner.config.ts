import { defineConfig } from '@playwright/test';
import { MARKED_DEFAULT_UA, markedDevice } from './e2e/support/e2eUserAgent';

export default defineConfig({
  testDir: './e2e',
  testMatch: /trip-planner-regression\.spec\.ts$/,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    // This suite handles real, temporary sessions. Keep them out of artifacts.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    userAgent: MARKED_DEFAULT_UA,
  },
  projects: [
    {
      name: 'trip-desktop',
      use: { ...markedDevice('Desktop Chrome'), viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'trip-mobile',
      use: { ...markedDevice('Pixel 5'), viewport: { width: 390, height: 844 } },
    },
  ],
});

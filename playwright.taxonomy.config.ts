import { defineConfig, devices } from '@playwright/test';
import { assertLocalTaxonomyEnvironment } from './e2e/support/taxonomyDatabase';

// Runs before the auth setup project: a bad target must fail before signing in.
const { frontend } = assertLocalTaxonomyEnvironment();
const state = 'playwright/.auth/taxonomy-admin.json';
process.env.E2E_AUTH_STATE_OUTPUT = state;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 3 : undefined,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/taxonomies',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/taxonomies', open: 'never' }],
    ['json', { outputFile: 'test-results/taxonomies.json' }],
  ],
  use: {
    baseURL: frontend.origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'taxonomy-auth', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'taxonomy-chromium',
      testMatch: /taxonomy-management\.spec\.ts$/,
      dependencies: ['taxonomy-auth'],
      use: { ...devices['Desktop Chrome'], storageState: state },
    },
  ],
});

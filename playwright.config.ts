import { defineConfig, devices } from '@playwright/test';

// Runs against an already-running web app (default http://localhost:3400).
// Credentials come from env only: ONLYORDERS_TEST_EMAIL / ONLYORDERS_TEST_PASSWORD.
// Browser engine is Lightpanda over CDP (started by global-setup); the
// Playwright package stays only as the test runner + CDP driver. No rendering:
// specs save DOM snapshots (*.html) instead of screenshots.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3400',
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});

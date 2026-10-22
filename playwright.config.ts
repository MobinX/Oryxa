import { defineConfig, devices } from '@playwright/test';

// Runs against an already-running web app (default http://localhost:3400).
// Credentials come from env only: ONLYORDERS_TEST_EMAIL / ONLYORDERS_TEST_PASSWORD.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3400',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});

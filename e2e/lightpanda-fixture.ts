import { test as base, chromium } from '@playwright/test';

// All e2e tests run against Lightpanda (CDP) instead of Playwright's bundled
// Chromium. Override the `browser` fixture so existing specs keep working
// unchanged: `browser.newContext()` / `page` behave as before, minus rendering
// (no screenshots, no video — see ./snap.ts and E2E_VIDEO below).
export const LIGHTPANDA_CDP_URL =
  process.env.LIGHTPANDA_CDP_URL || 'ws://127.0.0.1:9222';

export const test = base.extend({
  browser: async ({}, use) => {
    const browser = await chromium.connectOverCDP(LIGHTPANDA_CDP_URL);
    await use(browser);
    await browser.close();
  },
});

export const expect = base.expect;
export type { Page, Locator, Browser, BrowserContext } from '@playwright/test';

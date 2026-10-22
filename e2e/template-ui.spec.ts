import { test, expect } from '@playwright/test';

const BASE = process.env.TEMPLATE_URL || 'http://127.0.0.1:3410';
const OUT = '/workspace/oryxa-shots';

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'android', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
] as const;

for (const device of VIEWPORTS) {
  test(`template ui ${device.name}`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'viewports are defined per test');

    const context = await browser.newContext({
      viewport: device.viewport,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      deviceScaleFactor: device.isMobile ? 2 : 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('header').first()).toBeVisible();

    const phoneDemo = page
      .locator(
        '[data-testid="hero-phone"], [data-testid="hero-phone-demo"], [data-testid="phone-demo"]',
      )
      .or(page.getByRole('button', { name: /(play|pause) simulation/i }))
      .first();
    await expect(phoneDemo).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body ? document.body.scrollWidth : 0,
        ) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: `${OUT}/template-ui-${device.name}.png`,
      fullPage: true,
    });

    await context.close();
  });
}

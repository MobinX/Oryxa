import { test, expect } from '@playwright/test';
const BASE = process.env.HOME_URL || 'http://127.0.0.1:3400';
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['android', { width: 412, height: 915 }]] as const) {
  test(`home ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: name === 'android', hasTouch: name === 'android' });
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await expect(p.locator('#features')).toBeVisible();
    await expect(p.getByText('Less busywork.')).toHaveCount(0);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await p.screenshot({ path: `/workspace/oryxa-shots/template-ui-v2-${name}.png`, fullPage: true });
    await p.locator('#features').screenshot({ path: `/workspace/oryxa-shots/template-ui-v2-middle-${name}.png` });
    await ctx.close();
  });
}

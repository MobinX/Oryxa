import { test, expect } from './lightpanda-fixture';
import { snapLocator, snapPage } from './snap';
const BASE = process.env.HOME_URL || 'http://127.0.0.1:3400';
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['android', { width: 412, height: 915 }]] as const) {
  test(`home ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: name === 'android', hasTouch: name === 'android' });
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await expect(p.locator('h1')).toContainText('Your orders,');
    await expect(p.locator('h1')).toContainText('on autopilot.');
    await expect(p.locator('#video')).toBeVisible();
    await expect(p.locator('#workflow')).toBeVisible();
    await expect(p.locator('#pricing')).toBeVisible();
    await expect(p.locator('#video video')).toHaveAttribute('src', /onlyorders-commercial\.mp4/);
    // Theme toggle renders in its default (light-mode) state. Clicks are not
    // asserted: this Lightpanda build cannot hydrate React 19 (readable.tee
    // gap, fails on every page), so client interactions need a real browser.
    await expect(p.getByRole('button', { name: 'Switch between light and dark theme' })).toContainText('Dark');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await snapPage(p, `/tmp/oryxa-shots/template-ui-v2-${name}.png`);
    await snapLocator(p.locator('#workflow'), `/tmp/oryxa-shots/template-ui-v2-middle-${name}.png`);
    await ctx.close();
  });
}

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
    await expect(p.locator('#pricing')).toContainText('30-day free trial');
    expect(await p.locator('#pricing .oo-plan-card').count()).toBeGreaterThanOrEqual(3);
    await expect(p.locator('#pricing .oo-plan-card', { hasText: 'Most popular' })).toBeVisible();
    await expect(p.locator('#video video')).toHaveAttribute('src', /onlyorders-commercial\.mp4/);
    // Custom player: no native controls, mute button only.
    await expect(p.locator('#video video')).not.toHaveAttribute('controls', '');
    await expect(p.locator('#video button[aria-label="Unmute video"]')).toBeVisible();
    // Language switcher + demo pause + full footer.
    await expect(p.getByRole('button', { name: 'বাংলায় দেখুন' })).toBeVisible();
    await expect(p.getByRole('button', { name: /Pause demo/ })).toBeVisible();
    await expect(p.locator('footer')).toContainText('Data deletion');
    // Localhost serves the Oryxa brand, so the nav shows the neutral cart icon
    // (onlyorders.tech serves the transparent OnlyOrders mark instead).
    await expect(p.locator('header img[src="/icon-96.png"]')).toBeVisible();
    // Icon-only theme toggle renders (moon in light mode). Clicks are not
    // asserted: this Lightpanda build cannot hydrate React 19 (readable.tee
    // gap, fails on every page), so client interactions need a real browser.
    await expect(p.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await snapPage(p, `/tmp/oryxa-shots/template-ui-v2-${name}.png`);
    await snapLocator(p.locator('#workflow'), `/tmp/oryxa-shots/template-ui-v2-middle-${name}.png`);
    await ctx.close();
  });
}

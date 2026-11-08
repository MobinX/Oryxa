import { test, expect } from './lightpanda-fixture';
import { snapLocator } from './snap';
const BASE = process.env.HOME_URL || 'http://127.0.0.1:3410';
// Video needs real Chromium — Lightpanda has no renderer. Off unless E2E_VIDEO=1
// with a Chromium-backed CDP endpoint in LIGHTPANDA_CDP_URL.
const VIDEO = process.env.E2E_VIDEO === '1';
for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['android', { width: 412, height: 915 }]] as const) {
  test(`home motion ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: name === 'android', hasTouch: name === 'android', recordVideo: VIDEO && name === 'desktop' ? { dir: '/tmp/pwvideo', size: vp } : undefined });
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    // Chat simulation content renders (SSR shows the opening messages; the
    // timed playback needs a real browser — Lightpanda cannot hydrate React).
    await expect(p.getByText('Assalamualaikum').first()).toBeVisible({ timeout: 15000 });
    const s = p.locator('#workflow');
    await s.scrollIntoViewIfNeeded();
    await expect(s).toBeVisible();
    // Eight pipeline tabs + tour pause button, auto-advancing step counter.
    await expect(s.getByRole('button')).toHaveCount(9);
    await expect(s.getByRole('button', { name: /tour/i })).toBeVisible();
    await expect(s.getByText(/Step \d of 8/)).toBeVisible();
    await p.waitForTimeout(name === 'desktop' ? 5000 : 2500);
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await snapLocator(s, `/tmp/oryxa-shots/template-ui-motion-${name}.png`);
    await ctx.close();
    if (VIDEO && name === 'desktop') await p.video()!.saveAs('/tmp/oryxa-shots/template-ui-motion.webm');
  });
}
test('reduced motion renders', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await expect(p.locator('#workflow')).toBeVisible();
  await expect(p.locator('h1')).toContainText('on autopilot.');
  await ctx.close();
});

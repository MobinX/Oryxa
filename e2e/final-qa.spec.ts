import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'fs';
const BASE = process.env.BASE!;
const REPORT = '/workspace/oryxa-shots/final-qa-report.md';
const VPS = [['desktop', { width: 1440, height: 900 }], ['android', { width: 412, height: 915 }]] as const;
test.setTimeout(600_000);

function watch(p: Page, errs: string[]) {
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 120)); });
  p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push(`${r.status()} ${new URL(r.url()).pathname}`); });
}
for (const [vp, size] of VPS) {
  test(`final qa ${vp}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size, isMobile: vp === 'android', hasTouch: vp === 'android' });
    await ctx.route(BASE + '/**', (rt) => rt.continue({ headers: { ...rt.request().headers(), 'ngrok-skip-browser-warning': '1' } }));
    const p = await ctx.newPage();
    const errs: string[] = []; watch(p, errs);
    const log = async (name: string, status: number | string) => {
      const text = (await p.locator('body').innerText().catch(() => '')).trim();
      if (text.length < 50) errs.push('blank page');
      appendFileSync(REPORT, `| ${vp} | ${name} | ${status} | ${errs.join('; ') || 'ok'} |\n`);
      await p.screenshot({ path: `/workspace/oryxa-shots/final-${vp}-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`, fullPage: false });
      errs.length = 0;
    };
    const r = await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    const secs = await p.locator('main section, body > section, section').count();
    const f = p.locator('#features'); await f.scrollIntoViewIfNeeded(); await expect(f).toBeVisible();
    const before = await f.innerText(); await p.waitForTimeout(8000); const after = await f.innerText();
    if (before === after) errs.push('features animation did not advance');
    await log(`home (${secs} sections)`, r?.status() ?? '?');
    await p.goto(BASE + '/login');
    await p.getByPlaceholder('you@example.com').fill(process.env.ONLYORDERS_TEST_EMAIL!);
    await p.getByPlaceholder('Your password').fill(process.env.ONLYORDERS_TEST_PASSWORD!);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
    if (!/\/b\/[0-9a-f-]{36}/.test(p.url())) {
      await p.goto(BASE + '/businesses');
      await p.locator('a[href^="/b/"]').first().click();
      await p.waitForURL(/\/b\/[0-9a-f-]{36}/, { timeout: 60_000 });
    }
    await p.waitForLoadState('networkidle').catch(() => {});
    const base = p.url().match(/\/b\/[0-9a-f-]{36}/)![0];
    let hrefs = await p.$$eval('a[href^="/b/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')!.split('?')[0]))]);
    hrefs = hrefs.filter((h) => h.startsWith(base)).slice(0, 30);
    errs.length = 0;
    for (const h of [base, ...hrefs.filter((x) => x !== base)]) {
      const res = await p.goto(BASE + h, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => null);
      await p.waitForTimeout(800);
      await log(h.replace(base, '') || '/overview', res?.status() ?? 'timeout');
    }
    await ctx.close();
  });
}

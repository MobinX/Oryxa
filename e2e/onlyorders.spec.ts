import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.ONLYORDERS_TEST_EMAIL;
const PASSWORD = process.env.ONLYORDERS_TEST_PASSWORD;
const SHOTS = process.env.E2E_SHOTS_DIR || '/workspace/oryxa-shots';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });
}

test.describe('public pages', () => {
  for (const path of ['/', '/pricing', '/features', '/login', '/privacy', '/terms']) {
    test(`renders ${path}`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
      await shot(page, `public${path === '/' ? '-home' : path.replace(/\//g, '-')}`);
    });
  }
});

test.describe('merchant (test user)', () => {
  test.skip(!EMAIL || !PASSWORD, 'ONLYORDERS_TEST_EMAIL/PASSWORD not set');

  test('logs in and opens the main merchant pages', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(EMAIL!);
    await page.getByPlaceholder('Your password').fill(PASSWORD!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
    await shot(page, 'after-login');

    // Find the first business the user can open.
    if (!/\/b\/[0-9a-f-]{36}/.test(page.url())) {
      await page.goto('/businesses');
      const link = page.locator('a[href^="/b/"]').first();
      await expect(link).toBeVisible({ timeout: 30_000 });
      await link.click();
      await page.waitForURL(/\/b\/[0-9a-f-]{36}/, { timeout: 30_000 });
    }
    const base = page.url().match(/\/b\/[0-9a-f-]{36}/)![0];

    for (const section of ['dashboard', 'inbox', 'orders', 'products', 'customers']) {
      const res = await page.goto(`${base}/${section}`);
      expect(res?.status(), section).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, `merchant-${section}`);
    }
  });
});

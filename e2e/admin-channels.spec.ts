import { test, expect, type Page } from '@playwright/test';

/**
 * Admin console pages (spec L: "Playwright e2e: log in and check new admin pages").
 * Runs against an already-running web app; the operator signs in with the console's own
 * email+password login. Skipped without ONLYORDERS_OPERATOR_EMAIL / ONLYORDERS_OPERATOR_PASSWORD —
 * real credentials come from env only.
 */
const EMAIL = process.env.ONLYORDERS_OPERATOR_EMAIL;
const PASSWORD = process.env.ONLYORDERS_OPERATOR_PASSWORD;
const SHOTS = process.env.E2E_SHOTS_DIR || '/workspace/oryxa-shots';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: false });
}

const PAGES = [
  { path: '/admin', heading: /dashboard/i },
  { path: '/admin/channels', heading: 'Admin channels' },
  { path: '/admin/official', heading: 'Official channels' },
  { path: '/admin/official/inbox', heading: 'Official inbox' },
  { path: '/admin/official/tickets', heading: 'Tickets' },
  { path: '/admin/official/prospects', heading: 'Prospects' },
];

test.describe('admin console pages', () => {
  test.skip(!EMAIL || !PASSWORD, 'ONLYORDERS_OPERATOR_EMAIL/PASSWORD not set');
  test.setTimeout(120_000);

  test('operator signs in and every admin page renders', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel(/user id|email/i).fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'), {
      timeout: 45_000,
    });

    for (const { path, heading } of PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 30_000 });
      // The page body must not be a server-error card (e.g. a 500 from the API).
      await expect(page.getByRole('main')).not.toContainText(/Internal Server Error|\b5\d\d:/);
      await shot(page, `admin${path.replace(/\//g, '-')}`);
    }
  });

  test('official pages carry the sidebar and honest Tiktok note', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'ONLYORDERS_OPERATOR_EMAIL/PASSWORD not set');
    await page.goto('/admin/login');
    await page.getByLabel(/user id|email/i).fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'), {
      timeout: 45_000,
    });

    await page.goto('/admin/official');
    await expect(page.getByText('Official channels')).toBeVisible({ timeout: 30_000 });
    // The AI settings form is real controls, not a screenshot.
    await expect(page.getByText('How the official AI answers')).toBeVisible();
    await expect(page.getByText('Connect WhatsApp')).toBeVisible();
    await expect(page.getByText('TikTok')).toBeVisible();
    // Dashboard still speaks in real numbers, not placeholders.
    await page.goto('/admin');
    await expect(page.getByRole('main')).not.toContainText(/TODO|placeholder sample/i);
    await shot(page, 'official-landing');
  });
});

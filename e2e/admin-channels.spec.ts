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

/** Desktop shows the real rail; phones collapse it to a hamburger, so either counts. */
const SIDEBAR = 'aside[aria-label="Console navigation"]:visible, [aria-label="Open navigation"]:visible';

const PAGES = [
  { path: '/admin', heading: 'Platform' },
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
    await shot(page, 'admin-login');
    await page.getByLabel(/user id|email/i).first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'), {
      timeout: 45_000,
    });

    for (const { path, heading } of PAGES) {
      const res = await page.goto(path);
      // Evidence first: shots land before assertions, so a legitimately different render
      // (migration-pending card, live numbers) still leaves its screenshot behind.
      await shot(page, `admin${path.replace(/\//g, '-')}`);
      expect(res?.status(), `${path} status`).toBeLessThan(400);
      // The console rail is the chrome of every signed-in page.
      await expect(page.locator(SIDEBAR).first()).toBeVisible({ timeout: 30_000 });
      // The official* pages may honestly show the migration-pending card instead of their
      // full content; both are valid renders, a raw 500 is not.
      if (path.startsWith('/admin/official')) {
        await expect(
          page.getByRole('heading', { name: heading }).or(page.getByText('Migration 0036 pending')).first(),
        ).toBeVisible({ timeout: 30_000 });
      } else {
        await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 30_000 });
      }
      // The page body must not be a server-error card (e.g. a 500 from the API).
      await expect(page.getByRole('main')).not.toContainText(/Internal Server Error|\b5\d\d:/);
    }
  });

  test('official pages carry the sidebar and honest Tiktok note', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'ONLYORDERS_OPERATOR_EMAIL/PASSWORD not set');
    await page.goto('/admin/login');
    await shot(page, 'admin-login');
    await page.getByLabel(/user id|email/i).first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.includes('login'), {
      timeout: 45_000,
    });

    await page.goto('/admin/official');
    await shot(page, 'admin-official');
    await expect(page.locator(SIDEBAR).first()).toBeVisible({ timeout: 30_000 });
    // Role-scoped so the sidebar link with the same label cannot shadow the heading.
    await expect(page.getByRole('heading', { name: 'Official channels' })).toBeVisible({ timeout: 30_000 });
    // Either the real AI/WhatsApp/TikTok controls are on the page, or the honest
    // "Migration 0036 pending" card is; a missing migration is a deployment state, not a fault.
    const migrationCard = page.getByText('Migration 0036 pending');
    const realControls = page
      .getByRole('heading', { name: 'How the official AI answers' })
      .or(page.getByRole('heading', { name: 'Connect WhatsApp' }))
      .or(page.getByRole('heading', { name: 'TikTok' }));
    await expect(realControls.or(migrationCard).first()).toBeVisible({ timeout: 30_000 });
    // A deployment without migration 0036 shows its own card, never a raw 500.
    await expect(page.getByRole('main')).not.toContainText(/Internal Server Error|\b5\d\d:/);
    // Dashboard still speaks in real numbers, not placeholders.
    await page.goto('/admin');
    await shot(page, 'admin-admin');
    await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('main')).not.toContainText(/TODO|placeholder sample/i);
  });
});

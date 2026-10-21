import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOTS_DIR = process.env.E2E_SHOTS_DIR ?? '/workspace/oryxa-shots';
const PROJECT = () => test.info().project.name;

function shotPath(step: number, suffix = '') {
  return path.join(SHOTS_DIR, `${PROJECT()}-hero-step${step}${suffix}.png`);
}

// Ensure shots dir exists before any test writes to it
test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

test.describe('Hero workflow showcase', () => {
  /** Navigate to the landing page and wait for showcase to be visible */
  async function openShowcase(page: Parameters<Parameters<typeof test>[1]>[0]) {
    await page.goto('/');
    await page.waitForSelector('[data-testid="hero-showcase"]', { state: 'visible', timeout: 10_000 });
  }

  test('showcase is visible on load', async ({ page }) => {
    await openShowcase(page);
    const showcase = page.locator('[data-testid="hero-showcase"]');
    await expect(showcase).toBeVisible();
    // Default scene is 1
    await expect(showcase).toHaveAttribute('data-scene', '1');
  });

  test('clicking step 4 sets data-scene=4', async ({ page }) => {
    await openShowcase(page);
    const chip = page.locator('[data-testid="showcase-step-4"]');
    await chip.click();
    const showcase = page.locator('[data-testid="hero-showcase"]');
    await expect(showcase).toHaveAttribute('data-scene', '4');
  });

  test('all 6 step chips are present', async ({ page }) => {
    await openShowcase(page);
    for (let n = 1; n <= 6; n++) {
      await expect(page.locator(`[data-testid="showcase-step-${n}"]`)).toBeVisible();
    }
  });

  test('screenshots: steps 1, 3, 4, 6', async ({ page }) => {
    await openShowcase(page);
    const showcase = page.locator('[data-testid="hero-showcase"]');

    // Step 1 — already active
    await expect(showcase).toHaveAttribute('data-scene', '1');
    await page.screenshot({ path: shotPath(1), fullPage: false });

    // Step 3
    await page.locator('[data-testid="showcase-step-3"]').click();
    await expect(showcase).toHaveAttribute('data-scene', '3');
    await page.screenshot({ path: shotPath(3), fullPage: false });

    // Step 4
    await page.locator('[data-testid="showcase-step-4"]').click();
    await expect(showcase).toHaveAttribute('data-scene', '4');
    await page.screenshot({ path: shotPath(4), fullPage: false });

    // Step 6
    await page.locator('[data-testid="showcase-step-6"]').click();
    await expect(showcase).toHaveAttribute('data-scene', '6');
    await page.screenshot({ path: shotPath(6), fullPage: false });
  });
});

test.describe('Hero showcase — reduced motion', () => {
  test('data-scene stays 1 after 5 seconds with prefers-reduced-motion: reduce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('[data-testid="hero-showcase"]', { state: 'visible', timeout: 10_000 });
    // Wait 5s — autoplay must NOT fire in reduced-motion mode
    await page.waitForTimeout(5_000);
    const showcase = page.locator('[data-testid="hero-showcase"]');
    await expect(showcase).toHaveAttribute('data-scene', '1');
  });
});

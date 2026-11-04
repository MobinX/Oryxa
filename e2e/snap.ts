import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Locator, Page } from '@playwright/test';

// Lightpanda has no rendering engine, so screenshots are impossible. These
// helpers save the DOM instead, keeping the same call-site paths with a .html
// extension so existing spec code barely changes.

function htmlPath(pngPath: string): string {
  return pngPath.replace(/\.png$/, '.html');
}

export async function snapPage(page: Page, pngPath: string): Promise<void> {
  const out = htmlPath(pngPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await page.content());
}

export async function snapLocator(locator: Locator, pngPath: string): Promise<void> {
  const out = htmlPath(pngPath);
  mkdirSync(dirname(out), { recursive: true });
  const html = await locator.evaluate((el) => el.outerHTML).catch(() => '');
  writeFileSync(out, html);
}

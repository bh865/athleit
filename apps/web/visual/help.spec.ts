import { expect, test } from '@playwright/test';

/**
 * Visual baselines for the public help center at the three design widths (desktop 1440, tablet 834, phone 390), light, with
 * dark for the home and article pages. They need no database. Baselines are generated, not committed from a laptop:
 *   HELP_VISUAL=1 pnpm --filter @athleit/web visual:update   (then commit the snapshots from CI's platform)
 * They are off unless HELP_VISUAL=1 so a missing baseline never fails the normal visual run.
 */
test.skip(process.env.HELP_VISUAL !== '1', 'set HELP_VISUAL=1 to run help visual baselines');

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'phone', width: 390, height: 844 },
] as const;
const PAGES = [
  ['home', '/help', true],
  ['category', '/help/c/payments-and-receipts', false],
  ['article', '/help/a/pay-in-installments', true],
  ['no-results', '/help/search?q=zzzqqqxx', false],
  ['contact', '/help/contact', false],
] as const;

for (const size of SIZES) {
  for (const [name, path, dark] of PAGES) {
    for (const theme of dark ? (['light', 'dark'] as const) : (['light'] as const)) {
      test(`${name} ${size.name} ${theme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('heading').first()).toBeVisible();
        await expect(page).toHaveScreenshot(`help-${name}-${size.name}-${theme}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  }
}

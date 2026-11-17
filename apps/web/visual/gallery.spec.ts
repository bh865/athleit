import { expect, test } from '@playwright/test';

/**
 * Visual regression targets: the design gallery (mirrors the design system) and the public
 * screens, in light and dark. Update baselines with `pnpm --filter @athleit/web visual:update`
 * after an intentional design change (see docs/design-system.md).
 */
const THRESHOLD = { maxDiffPixelRatio: 0.03 } as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test(`gallery sections (${theme})`, async ({ page }) => {
      await page.goto('/dev/design');
      await page.evaluate(() => document.fonts.ready);
      const panel = page.getByTestId(`gallery-${theme}`);
      await expect(panel).toBeVisible();
      for (const name of [
        'Color',
        'Type',
        'Liquid glass · 3 levels',
        'Buttons',
        'Inputs',
        'Chips, badges, status',
        'List rows and card',
        'States',
        'Schedule · rows and month',
        'Schedule · event detail',
        'Schedule · flows',
        'Payments · pay and receipt',
        'Payments · staff',
        'Payments · states',
        'Sidebar · sheet · toast',
      ]) {
        await expect(panel.getByRole('region', { name })).toHaveScreenshot(
          `gallery-${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png`,
          THRESHOLD,
        );
      }
    });

    for (const [name, path] of [
      ['sign-in', '/sign-in'],
      ['sign-up', '/sign-up'],
    ] as const) {
      test(`${name} (${theme})`, async ({ page }) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, THRESHOLD);
      });
    }
  });
}

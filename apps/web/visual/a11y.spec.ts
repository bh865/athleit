import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Automated accessibility checks (axe, WCAG 2.1 A and AA) for the registration surfaces that need no database:
 * the gallery sections that mirror the real screens, and the public pages. Automated checks catch roughly a third of
 * issues; the manual VoiceOver and keyboard pass in docs/mobile-manual-tests.md is still required.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test(`registration gallery sections have no axe violations (${theme})`, async ({ page }) => {
      await page.goto('/dev/design');
      await page.evaluate(() => document.fonts.ready);
      const panel = page.getByTestId(`gallery-${theme}`);
      await expect(panel).toBeVisible();
      for (const name of [
        'Registration · public page',
        'Registration · staff',
        'Registration · waivers and documents',
      ]) {
        await expect(panel.getByRole('region', { name })).toBeVisible();
        const results = await new AxeBuilder({ page })
          .include(`[data-testid="gallery-${theme}"] section[aria-label="${name}"]`)
          .withTags(TAGS)
          .analyze();
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`,
          ),
          name,
        ).toEqual([]);
      }
    });

    for (const [label, path] of [
      ['unknown registration link', '/r/this-event-does-not-exist-12345'],
      ['verify link without a token', '/register/verify'],
    ] as const) {
      test(`${label} has no axe violations (${theme})`, async ({ page }) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('heading').first()).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual(
          [],
        );
      });
    }
  });
}

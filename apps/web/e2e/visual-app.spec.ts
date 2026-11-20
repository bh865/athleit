import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, signUp } from './helpers';

/**
 * Visual regression of signed-in screens (home onboarding, add a child, family, team roster with
 * the player panel, loading/empty/error states) in light and dark. Runs with the e2e job because
 * it needs the hosted test project. Dynamic text (names, dates, codes) is masked.
 *
 * Schedule, event drawer and alerts are not built yet (Phase 3+); add them here when they ship.
 */
const THRESHOLD = { maxDiffPixelRatio: 0.03 } as const;

test.describe.serial('signed-in screens', () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'visual', 'Vic Visual');
  });
  test.afterAll(async () => {
    await cleanup();
  });

  const shoot = async (name: string, theme: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
      ...THRESHOLD,
      mask: [page.getByTestId('display-name'), page.getByTestId('context-switcher')],
    });
  };

  for (const theme of ['light', 'dark'] as const) {
    test(`home onboarding (${theme})`, async () => {
      await page.goto('/');
      await expect(page.getByTestId('hub-parent')).toBeVisible();
      await shoot('home', theme);
    });

    test(`add a child (${theme})`, async () => {
      await page.goto('/family/children/new');
      await expect(page.getByLabel('First name')).toBeVisible();
      await shoot('add-child', theme);
    });
  }

  test('family with a child, then the team roster and player panel', async () => {
    await page.goto('/family/children/new');
    await page.getByLabel('First name').fill('Sample');
    await page.getByLabel('Last name').fill('Child');
    await pickDate(page, 'Date of birth', '2016-04-02');
    await page.getByRole('button', { name: 'Add child' }).click();
    await expect(page.getByTestId('children-list')).toBeVisible();
    for (const theme of ['light', 'dark'] as const) await shoot('family', theme);

    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Visual Team');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'Visual Team' })).toBeVisible();
    for (const theme of ['light', 'dark'] as const) await shoot('team-empty-roster', theme);
  });
});

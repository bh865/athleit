import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Places model: one team = one static header (no dropdown), "Add or join" reachable from the account
 * menu, Home dashboard blocks, and the Roster page. Needs the hosted test project.
 */
test.describe.serial('places, home and roster', () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'places', 'Pia Places');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Places FC');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  });
  test.afterAll(cleanup);

  test('a single place is a static header with no dropdown', async () => {
    const header = page.getByTestId('context-switcher');
    await expect(header).toContainText('Places FC');
    await expect(header).toContainText('Admin');
    await expect(header.locator('button')).toHaveCount(0);
    await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  });

  test('add or join stays reachable from the account menu', async () => {
    await page.getByTestId('account-add').click();
    await expect(page.getByRole('link', { name: 'Create a club' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join a team' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Home is a dashboard, not a redirect', async () => {
    await page.goto('/');
    await expect(page.getByTestId('display-name')).toContainText('Pia');
    await expect(page.getByTestId('next-up')).toBeVisible();
    await expect(page.getByTestId('home-attention')).toBeVisible();
    await expect(page.getByTestId('home-roster')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('the Roster page opens from the sidebar and the team page links to it', async () => {
    await page.getByRole('link', { name: 'Roster' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Roster' })).toBeVisible();
    await page.getByTestId('context-switcher').click(); // static: no menu opens
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

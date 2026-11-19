import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Team details: seven tabs, old URLs redirect, People opens on the right segment, and the team code lives on
 * Overview and People · Invites (no longer on Settings). Needs the hosted test project like the other specs.
 */
test.describe.serial('team details', () => {
  let page: Page;
  let base = '';

  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'teamdetails', 'Tess Admin');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Detail Team');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    base = new URL(page.url()).pathname;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('admins see the eight tabs in order, and Schedule is gone', async () => {
    const tabs = page.getByRole('navigation', { name: 'Team sections' }).getByRole('link');
    await expect(tabs).toHaveText([
      'Overview',
      'People',
      'Payments',
      'Registrations',
      'Forms',
      'Waivers',
      'Documents',
      'Settings',
    ]);
  });

  test('Overview shows the all-caught-up state, quick actions and the team code', async () => {
    await expect(page.getByText('All caught up')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share team code' })).toBeVisible();
    await expect(page.getByTestId('join-code')).toHaveText(/^[A-Z0-9]{10}$/);
    await expect(page.getByTestId('open-roster')).toBeVisible();
  });

  test('People opens on Members when nothing is pending and keeps the segment in the URL', async () => {
    await page.getByRole('link', { name: 'People' }).click();
    await expect(page.getByRole('radio', { name: /^Members/ })).toBeChecked();
    await page.getByRole('radio', { name: 'Invites' }).click();
    await expect(page).toHaveURL(/\/people\?view=invites$/);
    await expect(page.getByTestId('join-code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate new code' })).toBeVisible();
  });

  test('Settings no longer shows the team code', async () => {
    await page.goto(`${base}/settings`);
    await expect(page.getByLabel('Team name')).toHaveValue('Detail Team');
    await expect(page.getByTestId('join-code')).toHaveCount(0);
    await expect(page.getByText('Club affiliation')).toBeVisible();
    await expect(page.getByText('Not linked')).toBeVisible();
  });

  test('the other tabs render their primary action', async () => {
    await page.goto(`${base}/registrations`);
    await expect(page.getByRole('link', { name: 'New registration' })).toBeVisible();
    await page.goto(`${base}/forms`);
    await expect(page.getByRole('link', { name: 'New form' })).toBeVisible();
    await expect(page.getByText('No forms yet')).toBeVisible();
    await page.goto(`${base}/waivers`);
    await expect(page.getByText('No required waivers yet')).toBeVisible();
    await page.getByRole('radio', { name: 'Library' }).click();
    await expect(page.getByRole('link', { name: 'New waiver' })).toBeVisible();
    await page.goto(`${base}/documents`);
    await page.getByRole('button', { name: 'Upload' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Upload document' })).toBeVisible();
  });

  test('old URLs redirect to their new home', async () => {
    const cases: [string, RegExp][] = [
      ['requests', /\/people\?view=requests$/],
      ['invites', /\/people\?view=invites$/],
      ['members', /\/people\?view=members$/],
      ['compliance', /\/waivers$/],
      ['schedule', /\/schedule$/],
    ];
    for (const [old, expected] of cases) {
      await page.goto(`${base}/${old}`);
      await expect(page, old).toHaveURL(expected);
    }
  });
});

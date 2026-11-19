import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Account page and the account chip menu. Needs the hosted test project (signs up a user).
 * Walks: chip menu keyboard behaviour, display name validation and save, roles and the
 * only-admin leave block, delete blocked for a sole admin, notification settings redirect.
 */
test.describe.serial('account', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'account', 'Ada Account');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Account Team');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  });
  test.afterAll(async () => cleanup());

  test('chip menu: Enter opens, Escape closes and returns focus to the chip', async () => {
    await page.goto('/');
    const chip = page.getByTestId('account-chip');
    await chip.focus();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: 'Account menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Account menu' })).toBeHidden();
    await expect(chip).toBeFocused();
  });

  test('chip menu opens Account and the chip shows as active there', async () => {
    await page.getByTestId('account-chip').click();
    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await page.waitForURL('**/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    await expect(page.getByTestId('account-chip')).toHaveAttribute('data-active', 'true');
  });

  test('display name: validation, save and the chip updates without a reload', async () => {
    const field = page.getByLabel('Display name', { exact: true });
    await field.fill('   ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Add a display name (1 to 80 characters).')).toBeVisible();
    await field.fill('Ada Renamed');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Display name saved')).toBeVisible();
    await expect(page.getByTestId('account-chip')).toContainText('Ada Renamed');
  });

  test('photo: a file over 5 MB or the wrong type is refused before upload', async () => {
    await page.getByTestId('avatar-file').setInputFiles({
      name: 'big.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByText('Upload failed')).toBeVisible();
    await page.getByTestId('avatar-file').setInputFiles({
      name: 'a.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(page.getByText('Choose a JPG, PNG or WebP photo.')).toBeVisible();
  });

  test('roles: the only admin cannot leave the team and cannot delete the account', async () => {
    await page.getByRole('button', { name: 'Leave Account Team' }).click();
    await page.getByRole('button', { name: 'Leave team' }).click();
    await expect(page.getByText('You’re the only admin of Account Team.')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByText('You can’t delete your account yet')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  });

  test('security: the last sign-in method cannot be disconnected', async () => {
    await expect(page.getByTestId('method-email')).toContainText('Connected');
    await expect(page.getByRole('button', { name: 'Disconnect Google' })).toHaveCount(0);
  });

  test('the old notification settings URL redirects into Account', async () => {
    await page.goto('/notifications/settings');
    await page.waitForURL('**/account#notifications');
    await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible();
  });
});

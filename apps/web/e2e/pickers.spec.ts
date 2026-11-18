import { expect, test, type Page } from '@playwright/test';

/**
 * Date and time pickers, exercised on the design gallery (no database needed).
 * Keyboard: arrows, Page Up/Down, Home/End, Escape, focus return.
 */
test.describe('DatePicker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/design');
    await page.evaluate(() => document.fonts.ready);
  });

  const panel = (page: Page) =>
    page.getByTestId('gallery-light').getByRole('region', { name: 'Pickers' });

  test('opens, selects a day with the keyboard, returns focus and shows a friendly date', async ({
    page,
  }) => {
    const field = panel(page).getByRole('button', { name: /Date of birth/ });
    await field.click();
    const dialog = page.getByRole('dialog', { name: 'Choose Date of birth' });
    await expect(dialog).toBeVisible();
    // Focus lands on the active day (today).
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toHaveText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
  });

  test('Escape closes without changing the value and returns focus', async ({ page }) => {
    const field = panel(page).getByRole('button', { name: /Starts on/ });
    await expect(field).toContainText('Nov 30, 2026');
    await field.click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Choose Starts on' })).toBeHidden();
    await expect(field).toBeFocused();
    await expect(field).toContainText('Nov 30, 2026');
  });

  test('year chooser jumps to a birth year', async ({ page }) => {
    const field = panel(page).getByRole('button', { name: /Date of birth/ });
    await field.click();
    await page
      .getByRole('dialog', { name: 'Choose Date of birth' })
      .getByRole('button', { name: /choose month and year/ })
      .click();
    await page
      .getByRole('button', { name: String(new Date().getFullYear() - 10), exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mar', exact: true }).click();
    await page
      .getByRole('button', { name: /^Friday, March 3,|^[A-Za-z]+, March 3,/ })
      .first()
      .click();
    await expect(field).toContainText(`Mar 3, ${new Date().getFullYear() - 10}`);
  });

  test('time picker confirms with Done', async ({ page }) => {
    const field = panel(page)
      .getByRole('button', { name: /Start time/ })
      .first();
    await field.click();
    const dialog = page.getByRole('dialog', { name: 'Choose Start time' });
    await dialog
      .getByRole('group', { name: 'Hour' })
      .getByRole('button', { name: '4', exact: true })
      .click();
    await dialog.getByRole('group', { name: 'Minute' }).getByRole('button', { name: '30' }).click();
    await dialog
      .getByRole('group', { name: 'AM or PM' })
      .getByRole('button', { name: 'PM' })
      .click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(field).toContainText('4:30 PM');
  });
});

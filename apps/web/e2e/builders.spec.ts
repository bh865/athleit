import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Form builder and registration builder. Needs the hosted test project like the other specs. The migration
 * 20260402000100_form_builder.sql must be applied there (half-width and placeholder settings, archive_form).
 */
test.describe.serial('builders', () => {
  let page: Page;
  let teamId = '';

  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'builders', 'Bea Builder');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Builder FC');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    teamId = new URL(page.url()).pathname.split('/').pop()!;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('the form builder starts from a template, edits, undoes, previews and saves', async () => {
    await page.goto(`/manage/forms/new?team=${teamId}`);
    await expect(page.getByText('Start with a template')).toBeVisible();
    await page.getByRole('button', { name: /Player Info/ }).click();
    await expect(page.getByRole('listitem').first()).toContainText('Player full name');

    // Select a question and rename it in the inspector.
    await page.getByRole('listitem').first().click();
    await page.getByLabel('Label', { exact: true }).fill('Child full name');
    await expect(page.getByRole('listitem').first()).toContainText('Child full name');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('listitem').first()).toContainText('Player full name');

    // "/" inserts a question type; Cmd or Ctrl D duplicates the selected one.
    await page.getByTestId('form-builder').getByRole('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await page.getByLabel('Search question types').fill('phone');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Label', { exact: true })).toBeVisible();
    await expect(page.getByText('Add a question label.').first()).toBeVisible(); // a new question is blank until named

    // Preview switches the whole canvas to what a parent sees.
    await page.getByLabel('Label', { exact: true }).fill('Phone for texts');
    await page.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByText('Preview · nothing you enter here is saved')).toBeVisible();
    await page.getByRole('radio', { name: 'Mobile' }).click();
    await page.getByRole('radio', { name: 'Edit' }).click();

    await page.getByRole('button', { name: 'Save form' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.waitForURL(/\/manage\/forms\/[0-9a-f-]{36}$/);
  });

  test('the Forms tab lists it with its question count, and duplicates and archives it', async () => {
    await page.goto(`/teams/${teamId}/forms`);
    const list = page.getByTestId('forms-library');
    await expect(list).toContainText('Player Info');
    await expect(list).toContainText('10 questions');
    await page.getByRole('button', { name: 'More actions for Player Info' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(list).toContainText('Player Info copy');
    await page.getByRole('button', { name: 'More actions for Player Info copy' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(page.getByRole('button', { name: /Archived \(1\)/ })).toBeVisible();
  });

  test('the registration builder blocks publishing until the checklist is clear', async () => {
    await page.goto(`/manage/registration/new?team=${teamId}`);
    await page.getByLabel('Registration name').first().fill('Builder Spring League');
    await page
      .getByRole('navigation', { name: 'Registration steps' })
      .getByRole('button', { name: /Review/ })
      .click();
    await expect(page.getByText(/to fix before you publish/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Fix 1 issue to publish/ })).toBeDisabled();

    // Choose the saved form on step 4; the block clears.
    await page
      .getByRole('navigation', { name: 'Registration steps' })
      .getByRole('button', { name: /Form & waivers/ })
      .click();
    await page
      .getByRole('radio', { name: /Player Info/ })
      .first()
      .click();
    await page
      .getByRole('navigation', { name: 'Registration steps' })
      .getByRole('button', { name: /Review/ })
      .click();
    await expect(page.getByText(/Everything looks good/)).toBeVisible();
  });

  test('creating a form from inside a registration returns with it selected and the draft kept', async () => {
    await page.goto(`/manage/registration/new?team=${teamId}`);
    await page.getByLabel('Registration name').first().fill('Builder Fall Clinic');
    await page
      .getByRole('navigation', { name: 'Registration steps' })
      .getByRole('button', { name: /Form & waivers/ })
      .click();
    await page.getByRole('button', { name: 'Create new form' }).click();
    await page.waitForURL(/\/manage\/forms\/new\?/);
    await page.getByLabel('Form name').fill('Clinic questions');
    await page.getByRole('button', { name: 'Start blank' }).click();
    await page.getByLabel('Label', { exact: true }).fill('Anything we should know?');
    await page.getByRole('button', { name: 'Save form' }).click();
    await page.waitForURL(/\/manage\/registration\/[0-9a-f-]{36}\/edit\?step=form&form=/);
    await expect(page.getByLabel('Registration name').first()).toHaveValue('Builder Fall Clinic');
    await expect(page.getByRole('radio', { name: /Clinic questions/ })).toBeChecked();
  });

  test('the old new-form and edit-registration URLs still work', async () => {
    await page.goto(`/manage/forms/new?team=${teamId}`);
    await expect(page.getByTestId('form-builder')).toBeVisible();
  });
});

import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Waiver builder, waiver library and the shared documents library. Needs the hosted test project, with
 * migration 20260403000000_waiver_reminders_archive.sql applied (reminders, archive_waiver).
 */
test.describe.serial('waivers and documents', () => {
  let page: Page;
  let teamId = '';
  const pdf = (name: string, bytes = 1200) => ({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(bytes, 'a'),
  });

  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'wavdocs', 'Wes Waiver');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Waiver FC');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    teamId = new URL(page.url()).pathname.split('/').pop()!;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('the waiver builder autosaves a draft, counts characters, and previews the signature step', async () => {
    await page.goto(`/manage/waivers/new?team=${teamId}`);
    await page.getByLabel('Waiver title').fill('Liability waiver');
    await page
      .getByLabel('Waiver text')
      .fill('I accept the risks.\n\nI allow emergency treatment.');
    await expect(page.getByText(/\d+ \/ 50,000/)).toBeVisible();
    await page.getByRole('button', { name: 'Initials line' }).click();
    await expect(page.getByLabel('Waiver text')).toHaveValue(/Initials: ____/);
    await expect(page.getByText('Draft v1').first()).toBeVisible();
    await page.waitForURL(/\/manage\/waivers\/[0-9a-f-]{36}/);
    await page.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByText('Preview · this is what parents see')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign waiver' })).toBeDisabled();
    await page.getByRole('radio', { name: 'Edit' }).click();
  });

  test('publishing asks first, freezes v1, and a later draft can be compared with it', async () => {
    await page.getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByRole('dialog')).toContainText('freezes this text');
    await page.getByRole('dialog').getByRole('button', { name: 'Publish v1' }).click();
    await expect(page.getByText(/v1 is live/)).toBeVisible();

    await page
      .getByLabel('Waiver text')
      .fill('I accept the risks and the new tournament terms.\n\nI allow emergency treatment.');
    await expect(page.getByRole('button', { name: 'Publish v2' })).toBeVisible();
    await page.getByRole('button', { name: 'Compare with draft' }).click();
    await expect(page.getByText('Comparing v1 with your draft')).toBeVisible();
    await expect(page.locator('ins').first()).toContainText('tournament');
    await page.getByRole('button', { name: 'Back to editing' }).click();
    await page.getByRole('button', { name: 'View' }).click();
    await expect(page.getByText('Viewing v1')).toBeVisible();
  });

  test('the Library shows the waiver with an inline Required toggle, and Compliance tracks it', async () => {
    await page.goto(`/teams/${teamId}/waivers`);
    await page.getByRole('radio', { name: 'Library' }).click();
    const card = page.getByTestId('waiver-library').getByRole('listitem').first();
    await expect(card).toContainText('Liability waiver');
    await expect(card).toContainText('Published v1');
    await card.getByLabel('Required').check();
    await expect(card.getByText('Waiver FC')).toBeVisible();
    await page.getByRole('radio', { name: 'Compliance' }).click();
    await expect(
      page
        .getByText('players across 1 required waiver')
        .or(page.getByText('Everyone is up to date'))
        .or(page.getByText('No required waivers yet')),
    ).toBeVisible();
  });

  test('documents: upload several files, see the type and size errors, then edit, pin, and undo an archive', async () => {
    await page.goto(`/teams/${teamId}/documents`);
    await expect(page.getByText('No documents yet')).toBeVisible();
    await page.getByRole('button', { name: 'Upload document' }).first().click();
    await page.getByLabel('Choose files').setInputFiles([
      pdf('Fall League Rules.pdf'),
      pdf('Tournament Schedule.pdf'),
      { name: 'roster.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('x') },
      {
        name: 'Season Video.mov',
        mimeType: 'video/quicktime',
        buffer: Buffer.alloc(21 * 1024 * 1024),
      },
    ]);
    await expect(page.getByText('Not supported. Use PDF, images or Office files.')).toBeVisible();
    await expect(page.getByText(/Over the 20 MB limit \(21 MB\)/)).toBeVisible();
    await page.getByLabel('Pin these documents to the top').check();
    await page.getByRole('button', { name: 'Upload 2 files' }).click();
    await expect(page.getByText('2 documents uploaded')).toBeVisible();
    const pinned = page.getByRole('region', { name: 'Pinned documents' });
    await expect(pinned).toContainText('Fall League Rules');

    // Edit: rename and make staff only.
    await page.getByRole('button', { name: 'More actions for Fall League Rules' }).first().click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await page.getByLabel('Title').fill('League Rules');
    await page.getByLabel('Visibility').selectOption('staff_only');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('League Rules').first()).toBeVisible();
    await expect(page.getByText('Staff only').first()).toBeVisible();

    // Archive with undo: the row leaves, Undo brings it back without ever archiving.
    await page
      .getByRole('button', { name: 'More actions for Tournament Schedule' })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Archived' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Tournament Schedule').first()).toBeVisible();
  });
});

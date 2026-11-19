import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, signUp } from './helpers';

/**
 * Family page and family code across three sessions: a guardian with two children, a second
 * person who asks to join with the family code, and a third who has no family. The code only
 * queues a request; the guardian approves or declines it.
 */
test.describe.serial('family page and family code', () => {
  let guardian: Page;
  let joiner: Page;
  let stranger: Page;

  test.beforeAll(async ({ browser }) => {
    guardian = (await newSession(browser)).page;
    joiner = (await newSession(browser)).page;
    stranger = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  async function addChild(page: Page, first: string, last: string, dob: string) {
    await page.goto('/family/children/new');
    await page.getByLabel('First name').fill(first);
    await page.getByLabel('Last name').fill(last);
    await pickDate(page, 'Date of birth', dob);
    await page.getByRole('button', { name: 'Add child' }).click();
    await expect(page.getByTestId('children-list')).toContainText(`${first} ${last}`);
  }

  test('a guardian with two children sees cards and no schedule or payment content', async () => {
    await signUp(guardian, 'guardian', 'Gia Guardian');
    await guardian.goto('/family');
    await addChild(guardian, 'Ava', 'Adams', '2016-04-02');
    await addChild(guardian, 'Ben', 'Adams', '2014-09-09');
    await guardian.goto('/family');
    await expect(guardian.getByTestId('child-card')).toHaveCount(2);
    await expect(guardian.getByTestId('child-card').first()).toContainText('No login (under 13)');
    await expect(guardian.getByRole('link', { name: 'Join a team' }).first()).toHaveAttribute(
      'href',
      /\/join\?player=/,
    );
    await expect(guardian.getByTestId('next-up')).toHaveCount(0);
    await expect(guardian.getByTestId('due-card')).toHaveCount(0);
    await expect(guardian.getByTestId('guardians-list')).toContainText('Gia Guardian');
    await expect(guardian.getByTestId('guardians-list')).toContainText('You');
    const axe = await new AxeBuilder({ page: guardian }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  });

  test('the invite card keeps the link flow and adds a Code tab; rotate asks first', async () => {
    await guardian.getByRole('button', { name: 'Create invite link' }).click();
    await expect(guardian.getByTestId('invite-link')).toBeVisible();
    // Revoked invites can be deleted too.
    await guardian.getByRole('button', { name: 'Revoke guardian invite' }).click();
    await expect(guardian.getByText('Revoked')).toBeVisible();
    await guardian.getByRole('button', { name: 'Delete guardian invite' }).click();
    await guardian
      .getByRole('alertdialog', { name: 'Delete this invite?' })
      .getByRole('button', { name: 'Delete invite' })
      .click();
    await expect(guardian.getByText('No invites yet.')).toBeVisible();
    await guardian.getByRole('radio', { name: 'Code' }).click();
    const first = (await guardian.getByTestId('family-code').textContent())?.replace(/\s/g, '');
    expect(first).toMatch(/^[A-Z0-9]{10}$/);
    await guardian.getByTestId('family-code-rotate').click();
    const dialog = guardian.getByRole('alertdialog', { name: 'Generate a new family code?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(guardian.getByTestId('family-code').textContent()).resolves.toContain(
      first!.slice(0, 5),
    );
    await guardian.getByTestId('family-code-rotate').click();
    await guardian
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Generate new code' })
      .click();
    await expect(guardian.getByTestId('family-code')).not.toContainText(first!.slice(0, 5));
  });

  test('a bad code is rejected', async () => {
    await signUp(joiner, 'joiner', 'Jo Joiner');
    await joiner.goto('/family');
    await joiner.getByTestId('join-family').click();
    await joiner.getByTestId('family-code-input').fill('ZZZZZZZZZZ');
    await joiner.getByRole('button', { name: 'Send request' }).click();
    await expect(joiner.getByText('isn’t right')).toBeVisible();
  });

  test('a second person requests with the code; the guardian approves and they see the children', async () => {
    await guardian.goto('/family');
    await guardian.getByRole('radio', { name: 'Code' }).click();
    const code = (await guardian.getByTestId('family-code').textContent())!.replace(/\s/g, '');
    await joiner.goto('/family');
    await joiner.getByTestId('join-family').click();
    await joiner.getByTestId('family-code-input').fill(code);
    await joiner.getByRole('button', { name: 'Send request' }).click();
    await expect(joiner.getByTestId('join-family-sent')).toBeVisible();
    await expect(joiner.getByTestId('child-card')).toHaveCount(0);

    await guardian.goto('/family');
    await guardian.getByRole('radio', { name: 'Code' }).click();
    const requests = guardian.getByTestId('guardian-requests');
    await expect(requests).toContainText('Jo Joiner');
    await requests.getByRole('button', { name: 'Approve Jo Joiner' }).click();
    const confirm = guardian.getByRole('alertdialog', {
      name: /Give Jo Joiner access to Ava and Ben/,
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Give access' }).click();
    await expect(requests).toHaveCount(0);

    await joiner.goto('/family');
    await expect(joiner.getByTestId('child-card')).toHaveCount(2);
    await expect(joiner.getByTestId('guardians-list')).toContainText('Gia Guardian');
  });

  test('a declined request grants nothing', async () => {
    await guardian.goto('/family');
    await guardian.getByRole('radio', { name: 'Code' }).click();
    const code = (await guardian.getByTestId('family-code').textContent())!.replace(/\s/g, '');
    await signUp(stranger, 'stranger', 'Sam Stranger');
    await stranger.goto('/family');
    await stranger.getByTestId('join-family').click();
    await stranger.getByTestId('family-code-input').fill(code);
    await stranger.getByRole('button', { name: 'Send request' }).click();
    await expect(stranger.getByTestId('join-family-sent')).toBeVisible();

    await guardian.goto('/family');
    await guardian.getByRole('radio', { name: 'Code' }).click();
    await guardian.getByRole('button', { name: 'Decline Sam Stranger' }).click();
    await expect(guardian.getByTestId('guardian-requests')).toHaveCount(0);
    await stranger.goto('/family');
    await expect(stranger.getByTestId('child-card')).toHaveCount(0);
  });

  test('no family yet: both paths are offered', async ({ browser }) => {
    const { page } = await newSession(browser);
    await signUp(page, 'nofamily', 'Nia NoFamily');
    await page.goto('/family');
    await expect(page.getByTestId('no-family')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a child' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join a family with a code' })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  });
});

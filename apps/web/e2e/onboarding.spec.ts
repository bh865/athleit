import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, signUp } from './helpers';

/** Sign-in screens and the first-run flow. Written against the design's copy deck. */
test.describe('sign in screens', () => {
  test('a wrong password shows the board copy and keeps the email', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('nobody-here@example.test');
    await page.getByLabel('Password').fill('not-the-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(
      page.getByText(
        'That email and password don’t match. Check them and try again, or reset your password.',
      ),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue('nobody-here@example.test');
  });

  test('empty submit moves focus to the first invalid field', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Your name')).toBeFocused();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('show and hide password, strength in words', async ({ page }) => {
    await page.goto('/sign-up');
    const password = page.getByLabel('Password');
    await password.fill('Correct-Horse-9');
    await expect(page.getByText('Password strength: Strong')).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /show/i }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('forgot password answers the same way for any email', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody-here@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists for', { exact: false })).toContainText(
      'nobody-here@example.test',
    );
    await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  });

  test('a reset page without a session says the link has expired', async ({ page }) => {
    await page.goto('/auth/reset');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });

  test('an invalid invite link shows its banner before the form', async ({ page }) => {
    await page.goto('/sign-in?next=%2Finvite%2Fnot-a-real-token');
    await expect(page.getByText('This invite isn’t valid')).toBeVisible();
    await expect(page.getByText('mistyped or already used')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('sign in has no axe violations', async ({ page }) => {
    await page.goto('/sign-in');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe.serial('first run: the parent path and Pending card', () => {
  let parent: Page;
  let coach: Page;
  let code = '';

  test.beforeAll(async ({ browser }) => {
    parent = (await newSession(browser)).page;
    coach = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('a coach creates a team and has a team code', async () => {
    await signUp(coach, 'obcoach', 'Olive Coach');
    await coach.goto('/teams/new');
    await coach.getByLabel('Team name').fill('E2E Onboarding FC');
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await coach.getByRole('link', { name: 'Settings' }).click();
    code = (await coach.getByTestId('join-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[A-Z0-9]{10}$/);
  });

  test('a new parent sees the hub, adds a child and sends the code', async () => {
    await signUp(parent, 'obparent', 'Pia Parent');
    await expect(parent.getByTestId('hub-parent')).toBeVisible();
    await parent.getByTestId('hub-parent').click();
    await parent.getByLabel('First name').fill('Maya');
    await parent.getByLabel('Last name').fill('Parent');
    await pickDate(parent, 'Date of birth', '2016-04-02');
    await expect(parent.getByText('never have their own login')).toBeVisible();
    await parent.getByRole('button', { name: 'Continue' }).click();
    await expect(parent.getByRole('heading', { name: 'Is Maya on a team?' })).toBeVisible();
    await parent.getByRole('button', { name: 'Enter a team code for Maya' }).click();
    await parent.getByLabel('Team code').fill(code);
    await parent.getByRole('button', { name: 'Send request' }).click();
    await expect(parent.getByTestId('parent-sent')).toContainText('Request sent');
    await parent.getByRole('button', { name: 'Done' }).click();
  });

  test('Home shows the Pending card without the team name, and Cancel works', async () => {
    const card = parent.getByTestId('request-pending');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Waiting for the team to approve Maya');
    await expect(card).not.toContainText('E2E Onboarding FC');
    await parent.getByRole('button', { name: 'Cancel request' }).first().click();
    await parent.getByRole('button', { name: 'Cancel request' }).last().click();
    await expect(parent.getByTestId('request-cancelled')).toContainText(
      'You cancelled this request',
    );
    await expect(parent.getByTestId('request-cancelled')).not.toContainText('E2E Onboarding FC');
  });
});

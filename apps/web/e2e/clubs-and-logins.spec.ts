import { expect, test, type Page } from '@playwright/test';

import { RUN, cleanup, newSession, signUp } from './helpers';

/** Club affiliation (request → approval, read-only visibility) and the 13+ player login claim. */
test.describe.serial('club links and player logins', () => {
  let clubAdmin: Page;
  let teamAdmin: Page;
  let guardian: Page;
  let teen: Page;
  let teen2: Page;
  let clubUrl = '';
  let teamUrl = '';
  const slug = `e2e-club-${RUN}`;

  test.beforeAll(async ({ browser }) => {
    clubAdmin = (await newSession(browser)).page;
    teamAdmin = (await newSession(browser)).page;
    guardian = (await newSession(browser)).page;
    teen = (await newSession(browser)).page;
    teen2 = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('a team asks to join a club and the club admin approves; the club can read but not edit', async () => {
    await signUp(clubAdmin, 'clubadmin', 'Cleo Club');
    await clubAdmin.getByRole('button', { name: 'Create a club' }).click();
    await clubAdmin.getByLabel('Club name').fill('E2E Club');
    await clubAdmin.getByLabel('Web address').fill(slug);
    await clubAdmin.getByRole('button', { name: 'Create club' }).click();
    await expect(clubAdmin.getByRole('heading', { name: 'E2E Club' })).toBeVisible();
    clubUrl = new URL(clubAdmin.url()).pathname;

    await signUp(teamAdmin, 'teamadmin', 'Tess Team');
    await teamAdmin.getByRole('button', { name: 'Create a team' }).click();
    await teamAdmin.getByLabel('Team name').fill('E2E Owls');
    await teamAdmin.getByLabel('Season').fill('Winter');
    await teamAdmin.getByRole('button', { name: 'Create team' }).click();
    await expect(teamAdmin.getByRole('heading', { name: 'E2E Owls' })).toBeVisible();
    teamUrl = new URL(teamAdmin.url()).pathname;

    // A team cannot affiliate itself: this only files a request.
    await teamAdmin.goto(`${teamUrl}/settings`);
    await teamAdmin.getByLabel('Club web address').fill(slug);
    await teamAdmin.getByRole('button', { name: 'Ask to join this club' }).click();
    await expect(teamAdmin.getByText('The club’s admin has to approve it')).toBeVisible();
    await expect(teamAdmin.getByText('pending')).toBeVisible();

    await clubAdmin.goto(clubUrl);
    const queue = clubAdmin.getByTestId('link-requests');
    await expect(queue).toContainText('E2E Owls');
    await queue.getByRole('button', { name: 'Approve' }).click();
    await expect(clubAdmin.getByRole('link', { name: 'E2E Owls' })).toBeVisible();

    await clubAdmin.getByRole('link', { name: 'E2E Owls' }).click();
    await expect(clubAdmin.getByRole('heading', { name: 'E2E Owls' })).toBeVisible();
    await expect(clubAdmin.getByText('Read only')).toBeVisible();
    await expect(clubAdmin.getByRole('link', { name: 'Invites' })).toHaveCount(0);

    await teamAdmin.goto(`${teamUrl}/settings`);
    await expect(teamAdmin.getByText('This team is part of a club.')).toBeVisible();
  });

  test('a 13+ player links their own login when the email matches; otherwise a guardian approves', async () => {
    await signUp(guardian, 'guardian', 'Gail Guardian');
    await guardian.getByRole('button', { name: 'Add my child' }).click();
    await guardian.getByLabel('First name').fill('Teddy');
    await guardian.getByLabel('Last name').fill('Teen');
    await guardian.getByLabel('Date of birth').fill('2011-01-01');
    await guardian.getByRole('button', { name: 'Add child' }).click();
    await guardian.getByRole('link', { name: /Teddy Teen/ }).click();
    await guardian.waitForURL(/\/family\/children\/[0-9a-f-]{36}/);
    const childPath = new URL(guardian.url()).pathname;
    const childId = childPath.split('/').pop() as string;
    await guardian
      .getByLabel('Their own login email (optional)')
      .fill(`e2e-${RUN}-teen@example.test`);
    await guardian.getByRole('button', { name: 'Save changes' }).click();
    await expect(guardian.getByText('Saved.')).toBeVisible();

    // A matching, confirmed email auto-approves.
    await signUp(teen, 'teen', 'Teddy Teen', `/claim/${childId}`);
    await teen.getByRole('button', { name: 'Link my login' }).click();
    await expect(teen.getByText('You’re linked.')).toBeVisible();

    // A different email only creates a review request, which grants nothing.
    await guardian
      .getByRole('link', { name: 'Family' })
      .click()
      .catch(() => guardian.goto('/family'));
    await guardian.goto('/family');
    await expect(guardian.getByTestId('children-list')).toContainText('Has login');

    await guardian.goto('/family/children/new');
    await guardian.getByLabel('First name').fill('Riley');
    await guardian.getByLabel('Last name').fill('Review');
    await guardian.getByLabel('Date of birth').fill('2012-02-02');
    await guardian.getByRole('button', { name: 'Add child' }).click();
    await guardian.getByRole('link', { name: /Riley Review/ }).click();
    await guardian.waitForURL(/\/family\/children\/[0-9a-f-]{36}/);
    const riley = new URL(guardian.url()).pathname.split('/').pop() as string;

    await signUp(teen2, 'teen2', 'Riley Reviewer', `/claim/${riley}`);
    await teen2.getByRole('button', { name: 'Link my login' }).click();
    await expect(teen2.getByTestId('claim-pending')).toBeVisible();

    await guardian.goto('/family');
    await expect(guardian.getByText('Riley Reviewer wants to sign in as Riley')).toBeVisible();
    await guardian.getByRole('button', { name: 'Approve' }).click();
    await expect(guardian.getByText('Riley Reviewer wants to sign in as Riley')).toHaveCount(0);
    await expect(guardian.getByTestId('children-list')).toContainText('Riley Review');
  });

  test('children under 13 cannot be given a login', async () => {
    await guardian.goto('/family/children/new');
    await guardian.getByLabel('First name').fill('Little');
    await guardian.getByLabel('Last name').fill('Kid');
    await guardian.getByLabel('Date of birth').fill('2020-03-03');
    await guardian.getByRole('button', { name: 'Add child' }).click();
    await guardian.getByRole('link', { name: /Little Kid/ }).click();
    await expect(guardian.getByText('Children under 13 have no login')).toBeVisible();
    await expect(guardian.getByLabel('Their own login email (optional)')).toHaveCount(0);
  });
});

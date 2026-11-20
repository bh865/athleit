import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, signUp } from './helpers';

/**
 * Phase 1 happy path across four separate sessions:
 * parent signs up and adds a child with no team; a coach creates a team and invites a second
 * coach by link; the second coach accepts in their own session; the parent requests to join with
 * the team code; staff approve; the child is placed on the roster; the parent sees the limited view.
 */
test.describe.serial('people, teams and rosters', () => {
  let parent: Page;
  let coach: Page;
  let assistant: Page;
  let teamUrl = '';
  let code = '';
  let inviteLink = '';

  test.beforeAll(async ({ browser }) => {
    parent = (await newSession(browser)).page;
    coach = (await newSession(browser)).page;
    assistant = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('a parent signs up and adds a child without joining a team', async () => {
    await signUp(parent, 'parent', 'Pat Parent');
    await expect(parent.getByTestId('display-name')).toContainText('Pat Parent');
    await parent.goto('/family/children/new');
    await expect(parent.getByText('never have their own login')).toBeVisible();
    await parent.getByLabel('First name').fill('Ava');
    await parent.getByLabel('Last name').fill('Adams');
    await pickDate(parent, 'Date of birth', '2016-04-02');
    await parent.getByRole('button', { name: 'Add child' }).click();
    await expect(parent.getByTestId('children-list')).toContainText('Ava Adams');
    await expect(parent.getByTestId('children-list')).toContainText('Not on a team yet');
  });

  test('a coach creates a team', async () => {
    await signUp(coach, 'coach', 'Casey Coach');
    await coach.goto('/teams/new');
    await coach.getByLabel('Team name').fill('E2E Hawks');
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach.getByRole('heading', { name: 'E2E Hawks' })).toBeVisible();
    teamUrl = new URL(coach.url()).pathname;
    await coach.getByTestId('team-tabs').getByRole('link', { name: 'Settings' }).click();
    code = (await coach.getByTestId('join-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[A-Z0-9]{10}$/);
  });

  test('the coach invites a second coach by link', async () => {
    await coach.goto(`${teamUrl}/people?view=invites`);
    await coach.getByLabel('Role').selectOption('coach');
    await coach.getByRole('button', { name: 'Create invite link' }).click();
    inviteLink = (await coach.getByTestId('invite-link').textContent())?.trim() ?? '';
    expect(inviteLink).toContain('/invite/');
    await expect(coach.getByAltText('QR code for the invite link')).toBeVisible();
  });

  test('the second coach signs up from the invite link and accepts in their own session', async () => {
    const path = new URL(inviteLink).pathname;
    await signUp(assistant, 'assistant', 'Alex Assistant', path);
    await expect(assistant.getByTestId('invite-landing')).toContainText('Join E2E Hawks as coach');
    await assistant.getByRole('button', { name: 'Accept invite' }).click();
    await expect(assistant.getByRole('heading', { name: 'E2E Hawks' })).toBeVisible();
    await expect(assistant.getByTestId('context-switcher')).toContainText('E2E Hawks');
    // The link was single-use.
    await assistant.goto(path);
    await expect(assistant.getByText('This invite can’t be used')).toBeVisible();
  });

  test('a join request grants nothing until staff approve it', async () => {
    await parent.goto('/join?player=');
    await parent.getByLabel('Team code').fill(code);
    await parent.getByLabel('Which child is this for?').selectOption({ label: 'Ava Adams' });
    await parent.getByRole('button', { name: 'Send request' }).click();
    await expect(parent.getByTestId('join-sent')).toBeVisible();
    await parent.goto(teamUrl);
    await expect(parent.getByText('We couldn’t open this team')).toBeVisible();
  });

  test('staff approve the request', async () => {
    await coach.goto(`${teamUrl}/people?view=requests`);
    const queue = coach.getByTestId('join-requests');
    await expect(queue).toContainText('Pat Parent');
    await expect(queue).toContainText('Parent of Ava Adams');
    await queue.getByRole('button', { name: 'Approve' }).click();
    // Decided requests leave the pending queue.
    await expect(coach.getByText('No join requests')).toBeVisible();
  });

  test('staff place the approved child through Ready to add and see guardian contacts', async () => {
    await coach.goto('/roster');
    const ready = coach.getByRole('region', { name: 'Ready to add' });
    await expect(ready).toContainText('Ava Adams');
    await ready.getByRole('button', { name: 'Add Ava Adams to the roster' }).click();
    const form = coach.getByTestId('place-form');
    await form.getByLabel('Jersey').fill('7');
    await form.getByRole('button', { name: 'FWD' }).click();
    await expect(form.getByLabel('Other position')).toHaveValue('FWD');
    await form.getByRole('button', { name: 'Add to roster' }).click();
    const list = coach.getByTestId('roster-list');
    await expect(list).toContainText('Ava Adams');
    await expect(list).toContainText('number 7');
    // The ready section and the form go away once nobody is waiting.
    await expect(coach.getByTestId('place-form')).toHaveCount(0);
    await expect(coach.getByRole('region', { name: 'Ready to add' })).toHaveCount(0);
    await list.getByRole('button', { name: /Ava Adams/ }).click();
    const panel = coach.getByTestId('player-panel');
    await expect(panel).toContainText('Guardian contacts');
    await expect(panel).toContainText('e2e-');
    await expect(panel.getByRole('link', { name: 'Email' })).toBeVisible();
    await expect(panel).toContainText('9 years old');
    const axe = await new AxeBuilder({ page: coach }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
  });

  test('closing the panel returns focus to the row', async () => {
    const row = coach.getByTestId('roster-list').getByRole('button', { name: /Ava Adams/ });
    await coach.getByTestId('player-panel').getByRole('button', { name: 'Close' }).click();
    await expect(coach.getByTestId('player-panel')).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  test('a second approved child shows the jersey conflict before anything is saved', async () => {
    await parent.goto('/family/children/new');
    await parent.getByLabel('First name').fill('Ben');
    await parent.getByLabel('Last name').fill('Adams');
    await pickDate(parent, 'Date of birth', '2014-02-11');
    await parent.getByRole('button', { name: 'Add child' }).click();
    await expect(parent.getByTestId('children-list')).toContainText('Ben Adams');
    await parent.goto('/join?player=');
    await parent.getByLabel('Team code').fill(code);
    await parent.getByLabel('Which child is this for?').selectOption({ label: 'Ben Adams' });
    await parent.getByRole('button', { name: 'Send request' }).click();
    await expect(parent.getByTestId('join-sent')).toBeVisible();
    await coach.goto(`${teamUrl}/people?view=requests`);
    await coach
      .getByTestId('join-requests')
      .getByRole('button', { name: 'Approve' })
      .first()
      .click();
    await coach.goto('/roster');
    await coach.getByRole('button', { name: 'Add Ben Adams to the roster' }).click();
    const form = coach.getByTestId('place-form');
    await form.getByLabel('Jersey').fill('7');
    await expect(form).toContainText('#7 is taken by Ava.');
    await expect(form.getByRole('button', { name: 'Add to roster' })).toBeDisabled();
    await form.getByLabel('Jersey').fill('8');
    await expect(form).not.toContainText('is taken by');
    await form.getByRole('button', { name: 'Add to roster' }).click();
    await expect(coach.getByTestId('roster-list')).toContainText('Ben Adams');
  });

  test('editing in the panel saves, and a player never conflicts with themself', async () => {
    const list = coach.getByTestId('roster-list');
    await list.getByRole('button', { name: /Ava Adams/ }).click();
    const panel = coach.getByTestId('player-panel');
    await expect(panel.getByLabel('Jersey')).toHaveValue('7');
    await panel.getByLabel('Jersey').fill('8');
    await expect(panel).toContainText('#8 is taken by Ben.');
    await expect(panel.getByRole('button', { name: 'Save' })).toBeDisabled();
    await panel.getByLabel('Jersey').fill('7'); // their own number
    await expect(panel).not.toContainText('is taken by');
    await panel.getByLabel('Jersey').fill('9');
    await panel.getByRole('button', { name: 'DEF' }).click();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel).toContainText('Saved');
    await expect(list).toContainText('number 9');
  });

  test('search and the status filter narrow the list', async () => {
    const list = coach.getByTestId('roster-list');
    await coach.getByLabel('Search players').fill('ben');
    await expect(list).toContainText('Ben Adams');
    await expect(list).not.toContainText('Ava Adams');
    await coach.getByLabel('Search players').fill('zzz');
    await expect(coach.getByText('No players match “zzz”')).toBeVisible();
    await coach.getByRole('button', { name: 'Clear search' }).click();
    await coach.getByLabel('Search players').fill('');
    await coach.getByRole('button', { name: 'Inactive', exact: true }).click();
    await expect(coach.getByText('No inactive players')).toBeVisible();
    await coach.getByRole('button', { name: 'Active', exact: true }).click();
    await expect(list).toContainText('Ava Adams');
  });

  test('the parent sees the squad view with no last names, photos, ages or status', async () => {
    await parent.goto('/roster');
    const limited = parent.getByTestId('roster-limited');
    await expect(limited).toContainText('number 9');
    await expect(limited).toContainText('Ava');
    await expect(limited).not.toContainText('Adams');
    await expect(parent.getByText('2 players')).toBeVisible();
    await expect(parent.getByText('Teammates are shown by first name only.')).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Inactive', exact: true })).toHaveCount(0);
    await expect(parent.getByRole('button', { name: 'Add player' })).toHaveCount(0);
    await expect(parent.locator('img')).toHaveCount(0);
    await expect(parent.getByRole('link', { name: 'Members' })).toHaveCount(0);
    await expect(parent.getByRole('link', { name: 'Requests' })).toHaveCount(0);
    const axe = await new AxeBuilder({ page: parent }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);
    // Team details is staff-only: a parent who opens the old members URL is sent home, not shown a notice.
    await parent.goto(`${teamUrl}/members`);
    await expect(parent).toHaveURL(/\/$/);
  });

  test('Set inactive hides the player from the parent and drops their contacts', async () => {
    await coach.goto('/roster');
    const list = coach.getByTestId('roster-list');
    await list.getByRole('button', { name: /Ben Adams/ }).click();
    const panel = coach.getByTestId('player-panel');
    await panel.getByRole('radio', { name: 'Inactive' }).click();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel).toContainText('Contacts are shown for active players only.');
    await coach.getByRole('button', { name: 'Inactive', exact: true }).click();
    await expect(list).toContainText('Ben Adams');
    await parent.goto('/roster');
    await expect(parent.getByTestId('roster-limited')).not.toContainText('Ben');
  });

  test('removing a player only happens through the confirm, with Set inactive as the safe default', async () => {
    const list = coach.getByTestId('roster-list');
    await list.getByRole('button', { name: /Ava Adams/ }).click();
    const panel = coach.getByTestId('player-panel');
    await panel.getByRole('button', { name: 'Remove from roster' }).click();
    const dialog = coach.getByRole('alertdialog');
    await expect(dialog).toContainText('This deletes their roster entry.');
    await expect(dialog.getByRole('button', { name: 'Set inactive' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(list).toContainText('Ava Adams'); // nothing was removed
    await panel.getByRole('button', { name: 'Remove from roster' }).click();
    await coach.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(coach.getByTestId('roster-list')).not.toContainText('Ava Adams');
  });
});

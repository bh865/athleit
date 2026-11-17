import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

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
    await parent.getByRole('button', { name: 'Add my child' }).click();
    await expect(parent.getByText('never have their own login')).toBeVisible();
    await parent.getByLabel('First name').fill('Ava');
    await parent.getByLabel('Last name').fill('Adams');
    await parent.getByLabel('Date of birth').fill('2016-04-02');
    await parent.getByRole('button', { name: 'Add child' }).click();
    await expect(parent.getByTestId('children-list')).toContainText('Ava Adams');
    await expect(parent.getByTestId('children-list')).toContainText('Not on a team yet');
  });

  test('a coach creates a team', async () => {
    await signUp(coach, 'coach', 'Casey Coach');
    await coach.getByRole('button', { name: 'Create a team' }).click();
    await coach.getByLabel('Team name').fill('E2E Hawks');
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach.getByRole('heading', { name: 'E2E Hawks' })).toBeVisible();
    teamUrl = new URL(coach.url()).pathname;
    await coach.getByRole('link', { name: 'Settings' }).click();
    code = (await coach.getByTestId('join-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[A-Z0-9]{10}$/);
  });

  test('the coach invites a second coach by link', async () => {
    await coach.goto(`${teamUrl}/invites`);
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
    await coach.goto(`${teamUrl}/requests`);
    const queue = coach.getByTestId('join-requests');
    await expect(queue).toContainText('Pat Parent');
    await expect(queue).toContainText('For Ava Adams');
    await queue.getByRole('button', { name: 'Approve' }).click();
    await expect(queue.getByText('approved')).toBeVisible();
  });

  test('staff place the child on the roster and see guardian contacts', async () => {
    await coach.goto(teamUrl);
    const form = coach.getByTestId('place-form');
    await form.getByLabel('Jersey number').fill('7');
    await form.getByLabel('Position').fill('Forward');
    await form.getByRole('button', { name: 'Add to roster' }).click();
    const list = coach.getByTestId('roster-list');
    await expect(list).toContainText('Ava Adams');
    await list.getByRole('button', { name: /Ava Adams/ }).click();
    await expect(coach.getByTestId('player-panel')).toContainText('e2e-');
    // Jersey numbers are unique among active players.
    await expect(coach.getByTestId('place-form')).toHaveCount(0);
  });

  test('the parent now sees the limited roster only', async () => {
    await parent.goto(teamUrl);
    const limited = parent.getByTestId('roster-limited');
    await expect(limited).toContainText('#7');
    await expect(limited).toContainText('Ava');
    await expect(limited).not.toContainText('Adams');
    await expect(parent.getByRole('link', { name: 'Members' })).toHaveCount(0);
    await expect(parent.getByRole('link', { name: 'Requests' })).toHaveCount(0);
    await parent.goto(`${teamUrl}/members`);
    await expect(parent.getByText('Only team staff can see members.')).toBeVisible();
  });
});

import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickTime, signUp } from './helpers';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Two browser sessions exchange messages live: a coach (staff) and a parent. Covers group threads,
 * announcements and who can post, attachments, reactions, report and hide. Database safety rules
 * (minors, two-adult groups, rate limits) are proven in pgTAP; the UI explains them in plain text.
 */
test.describe.serial('messaging', () => {
  let coach: Page;
  let parent: Page;
  let threadUrl = '';

  test.beforeAll(async ({ browser }) => {
    coach = (await newSession(browser)).page;
    parent = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('a coach creates a team and invites a parent', async () => {
    await signUp(coach, 'mcoach', 'Casey Coach');
    await coach.getByRole('button', { name: 'Create a team' }).click();
    await coach.getByLabel('Team name').fill('Msg Hawks');
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach.getByRole('heading', { name: 'Msg Hawks' })).toBeVisible();
    const teamUrl = new URL(coach.url()).pathname;
    await coach.goto(`${teamUrl}/invites`);
    await coach.getByLabel('Role').selectOption('parent');
    await coach.getByRole('button', { name: 'Create invite link' }).click();
    const link = (await coach.getByTestId('invite-link').textContent())?.trim() ?? '';
    await signUp(parent, 'mparent', 'Pat Parent', new URL(link).pathname);
    await parent.getByRole('button', { name: 'Accept invite' }).click();
    await expect(parent.getByRole('heading', { name: 'Msg Hawks' })).toBeVisible();
  });

  test('the coach starts a group with the parent', async () => {
    await coach.getByRole('link', { name: 'Messages' }).click();
    await expect(coach.getByText('No messages yet')).toBeVisible();
    await coach.goto('/messages/new');
    await coach.getByRole('radio', { name: 'Group' }).click();
    await coach.getByLabel('Group name').fill('Game day');
    await coach.getByRole('button', { name: /Pat Parent/ }).click();
    await coach.getByRole('button', { name: 'Start conversation' }).click();
    await expect(coach).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    threadUrl = new URL(coach.url()).pathname;
  });

  test('messages arrive live in the other session, with no reload', async () => {
    await parent.goto(threadUrl);
    await expect(parent.getByRole('region', { name: /Game day/ })).toBeVisible();
    await coach.getByLabel('Message', { exact: true }).fill('Practice moved to 5pm');
    await coach.getByRole('button', { name: 'Send message' }).click();
    await expect(
      coach.getByTestId('message').filter({ hasText: 'Practice moved to 5pm' }),
    ).toBeVisible();
    await expect(
      parent.getByTestId('message').filter({ hasText: 'Practice moved to 5pm' }),
    ).toBeVisible();

    await parent.getByLabel('Message', { exact: true }).fill('Got it, thanks!');
    await parent.keyboard.press('Enter');
    await expect(coach.getByTestId('message').filter({ hasText: 'Got it, thanks!' })).toBeVisible();
  });

  test('read receipts and reactions update live', async () => {
    await expect(
      coach.getByTestId('message').filter({ hasText: 'Practice moved to 5pm' }),
    ).toContainText('Read');
    const bubble = parent.getByTestId('message').filter({ hasText: 'Practice moved to 5pm' });
    await bubble.hover();
    await bubble.getByRole('button', { name: 'React: Thumbs up' }).click();
    await expect(
      coach
        .getByTestId('message')
        .filter({ hasText: 'Practice moved to 5pm' })
        .getByRole('button', { name: /Thumbs up, 1/ }),
    ).toBeVisible();
  });

  test('attachments upload to private storage and show in the thread', async () => {
    await coach
      .getByTestId('attach-input')
      .setInputFiles({ name: 'field.png', mimeType: 'image/png', buffer: PNG });
    await expect(coach.getByText('field.png')).toBeVisible();
    await coach.getByLabel('Message', { exact: true }).fill('Field map');
    await coach.getByRole('button', { name: 'Send message' }).click();
    await expect(
      parent.getByTestId('message').filter({ hasText: 'Field map' }).getByRole('img'),
    ).toBeVisible();
  });

  test('only staff can post announcements; parents read them', async () => {
    await coach.goto('/messages/new');
    await coach.getByRole('radio', { name: 'Announcement' }).click();
    await coach.getByLabel('Announcement title').fill('Season news');
    await coach.getByRole('button', { name: 'Create announcement' }).click();
    await coach.getByLabel('Message', { exact: true }).fill('Photos are Saturday');
    await coach.getByRole('button', { name: 'Send message' }).click();
    const annUrl = new URL(coach.url()).pathname;

    await parent.goto(annUrl);
    await expect(
      parent.getByTestId('message').filter({ hasText: 'Photos are Saturday' }),
    ).toBeVisible();
    await expect(parent.getByText('ANNOUNCEMENT', { exact: true })).toBeVisible();
    await expect(parent.getByText('Only coaches and managers can post here.')).toBeVisible();
    await expect(parent.getByLabel('Message', { exact: true })).toHaveCount(0);

    // Parents cannot start groups or announcements from the new-message screen.
    await parent.goto('/messages/new');
    await expect(parent.getByRole('radio', { name: 'Group' })).toHaveCount(0);
  });

  test('a parent can report a message and staff can remove it for everyone', async () => {
    await coach.goto(threadUrl);
    await parent.goto(threadUrl);
    await parent.getByLabel('Message', { exact: true }).fill('Something rude');
    await parent.keyboard.press('Enter');
    const theirs = coach.getByTestId('message').filter({ hasText: 'Something rude' });
    await expect(theirs).toBeVisible();

    const row = coach.getByTestId('message').filter({ hasText: 'Something rude' });
    await row.hover();
    await row.getByRole('button', { name: 'Report' }).click();
    await coach.getByLabel('What’s wrong?').fill('Not appropriate');
    await coach.getByRole('button', { name: 'Send report' }).click();
    await expect(coach.getByText('Report sent')).toBeVisible();

    await row.hover();
    await row.getByRole('button', { name: 'Remove for everyone' }).click();
    await expect(coach.getByTestId('message').getByText('Removed by staff')).toBeVisible();
    await parent.reload();
    await expect(parent.getByTestId('message').getByText('Removed by staff')).toBeVisible();
    await expect(parent.getByTestId('message').getByText('Something rude')).toHaveCount(0);
  });

  test('the unread badge and thread list reflect new messages', async () => {
    await parent.goto('/messages');
    await expect(parent.getByTestId('thread-row').first()).toBeVisible();
    await coach.goto(threadUrl);
    await coach.getByLabel('Message', { exact: true }).fill('One more thing');
    await coach.getByRole('button', { name: 'Send message' }).click();
    await expect(parent.getByTestId('unread-dot').first()).toBeVisible();
    await expect(parent.getByRole('link', { name: /Messages/ })).toContainText(/\d/);
  });

  test('the alerts centre lists notifications and links to the thread', async () => {
    await parent.goto('/notifications');
    const row = parent.getByTestId('alert-row').filter({ hasText: 'Game day' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('New message from Casey Coach');
    await expect(row).not.toContainText('One more thing'); // message text never appears in alerts
    await row.click();
    await expect(parent).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  });

  test('notification preferences persist; quiet hours save with a timezone', async () => {
    await parent.goto('/notifications/settings');
    const messagesEmail = parent.getByLabel('Messages by email');
    await expect(messagesEmail).toBeChecked();
    await messagesEmail.uncheck();
    // The preference save reloads the form; wait for it so the time popover isn't remounted mid-pick.
    await parent.waitForLoadState('networkidle');
    await expect(messagesEmail).not.toBeChecked();
    await pickTime(parent, 'From', '21:00');
    await pickTime(parent, 'Until', '07:00');
    await parent.getByLabel('Timezone').selectOption('America/New_York');
    await parent.getByRole('button', { name: 'Save quiet hours' }).click();
    await expect(parent.getByText('Quiet hours saved')).toBeVisible();
    await parent.reload();
    await expect(parent.getByLabel('Messages by email')).not.toBeChecked();
    await expect(parent.getByRole('button', { name: /^From/ })).toContainText('9:00 PM');
    await expect(parent.getByLabel('Timezone')).toHaveValue('America/New_York');
    await expect(parent.getByText('No devices registered for push yet.')).toBeVisible();
  });
});

import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, pickTime, signUp } from './helpers';

/**
 * Phase 2: scheduling, RSVP and results across three sessions (a coach and two parents).
 * Coach creates a game and a recurring practice; parent A RSVPs for their child; counts update
 * for the coach; parent B cannot see RSVP names; the coach edits one occurrence versus the whole
 * series, cancels an occurrence and enters a result.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const isoWeekdayToday = () => (new Date().getDay() === 0 ? 7 : new Date().getDay());

/** Click an event row and wait until its own details (not the previously open event) are showing. */
async function openRow(page: Page, text: string, nth = 0) {
  const row = page.getByTestId('event-row').filter({ hasText: text }).nth(nth);
  const id = await row.getAttribute('data-event-id');
  // Agenda rows are cards whose first button opens the event (replies sit below); Week blocks are the button.
  const isButton = (await row.evaluate((el) => el.tagName)) === 'BUTTON';
  await (isButton ? row : row.getByRole('button').first()).click();
  await page.waitForURL((u) => u.search.includes(`event=${id}`));
  await expect(page.getByTestId('event-title')).toBeVisible();
}

async function addChildAndRequest(page: Page, first: string, last: string, code: string) {
  await page.getByRole('button', { name: 'Add my child' }).click();
  await page.getByLabel('First name').fill(first);
  await page.getByLabel('Last name').fill(last);
  await pickDate(page, 'Date of birth', '2016-04-02');
  await page.getByRole('button', { name: 'Add child' }).click();
  await expect(page.getByTestId('children-list')).toContainText(`${first} ${last}`);
  await page.goto('/join?player=');
  await page.getByLabel('Team code').fill(code);
  await page.getByLabel('Which child is this for?').selectOption({ label: `${first} ${last}` });
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByTestId('join-sent')).toBeVisible();
}

test.describe.serial('scheduling', () => {
  let coach: Page;
  let parentA: Page;
  let parentB: Page;
  let teamUrl = '';

  test.beforeAll(async ({ browser }) => {
    coach = (await newSession(browser)).page;
    parentA = (await newSession(browser)).page;
    parentB = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  test('setup: a team with two families on the roster', async () => {
    await signUp(coach, 'sc-coach', 'Casey Coach');
    await coach.getByRole('button', { name: 'Create a team' }).click();
    await coach.getByLabel('Team name').fill('E2E Schedulers');
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach.getByRole('heading', { name: 'E2E Schedulers' })).toBeVisible();
    teamUrl = new URL(coach.url()).pathname;
    await coach.getByRole('link', { name: 'Settings' }).click();
    const code = (await coach.getByTestId('join-code').textContent())?.trim() ?? '';

    await signUp(parentA, 'sc-a', 'Pat Parent');
    await addChildAndRequest(parentA, 'Ava', 'Adams', code);
    await signUp(parentB, 'sc-b', 'Bo Parent');
    await addChildAndRequest(parentB, 'Ben', 'Brown', code);

    await coach.goto(`${teamUrl}/people?view=requests`);
    const queue = coach.getByTestId('join-requests');
    for (const name of ['Pat Parent', 'Bo Parent']) {
      await queue.locator('li', { hasText: name }).getByRole('button', { name: 'Approve' }).click();
    }
    await coach.goto('/roster');
    for (const [child, jersey] of [
      ['Ava Adams', '7'],
      ['Ben Brown', '10'],
    ] as const) {
      const form = coach.getByTestId('place-form');
      await form.getByLabel('Child').selectOption({ label: child });
      await form.getByLabel('Jersey number').fill(jersey);
      await form.getByRole('button', { name: 'Add to roster' }).click();
      await expect(coach.getByTestId('roster-list')).toContainText(child);
    }
  });

  test('staff create a game and a recurring practice', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await expect(coach.getByTestId('new-event')).toBeVisible();

    // A game later today (so families can RSVP) with a saved place and opponent.
    await coach.getByTestId('new-event').click();
    await coach.getByRole('radio', { name: 'Game' }).click();
    await coach.getByLabel('Title').fill('Game vs. Hawks');
    await pickDate(coach, 'Date', todayKey());
    await pickTime(coach, 'Starts', '23:00');
    await pickTime(coach, 'Ends', '23:45');
    await coach.getByLabel('Location').selectOption({ label: 'Add a new place…' });
    await coach.getByLabel('Place name or address').fill('Field 3, Riverside Park');
    await coach.getByRole('button', { name: 'Save for next time' }).click();
    await coach
      .getByLabel('Opponent', { exact: true })
      .selectOption({ label: 'Add a new opponent…' });
    await coach.getByLabel('Opponent name').fill('Hawks');
    await coach.getByTestId('save-event').click();
    await expect(
      coach.getByTestId('event-row').filter({ hasText: 'Game vs. Hawks' }),
    ).toBeVisible();

    // Weekly practice on today's weekday, three times: one notification-worthy batch.
    await coach.getByTestId('new-event').click();
    await coach.getByLabel('Title').fill('Practice');
    await pickDate(coach, 'Date', todayKey());
    await pickTime(coach, 'Starts', '22:00');
    await pickTime(coach, 'Ends', '22:50');
    await coach.getByRole('radio', { name: 'Weekly' }).click();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    await coach
      .getByRole('dialog')
      .getByRole('button', { name: days[isoWeekdayToday() - 1]!, exact: true })
      .click();
    await coach.getByLabel('Number of events').fill('3');
    await coach.getByTestId('save-event').click();
    await expect(coach.getByText('3 practices added')).toBeVisible();
    await expect(
      coach.getByTestId('event-row').filter({ hasText: 'Practice' }).first(),
    ).toBeVisible();
  });

  test('a parent RSVPs for their child and the coach sees the count update live', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Game vs. Hawks');
    await expect(coach.getByTestId('rsvp-counts')).toContainText('No reply');
    await expect(coach.getByTestId('rsvp-row')).toHaveCount(2);

    await parentA.goto('/schedule');
    await openRow(parentA, 'Game vs. Hawks');
    const controls = parentA.getByTestId('rsvp-controls');
    await controls.getByRole('button', { name: /Going/ }).first().click();
    await expect(controls.getByRole('button', { name: /Going/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(controls.getByText('Ava: Going')).toBeVisible();

    // Realtime: the coach's open drawer updates without a reload.
    await expect(coach.getByTestId('rsvp-counts')).toHaveAttribute('aria-label', /1 going/);
    await expect(
      coach.getByTestId('rsvp-list').getByTestId('rsvp-row').filter({ hasText: 'Ava Adams' }),
    ).toBeVisible();
  });

  test('another family sees counts but never RSVP names', async () => {
    await parentB.goto('/schedule');
    await openRow(parentB, 'Game vs. Hawks');
    await expect(parentB.getByTestId('rsvp-counts')).toContainText('1');
    await expect(parentB.getByTestId('rsvp-list')).toHaveCount(0);
    await expect(parentB.getByTestId('event-drawer')).not.toContainText('Ava');
    await expect(parentB.getByTestId('rsvp-controls')).toContainText('Ben');
  });

  test('staff edit one occurrence, then the whole series', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Practice');
    await coach.getByTestId('edit-event').click();
    await coach.getByRole('radio', { name: 'This event' }).click();
    await coach.getByLabel('Title').fill('Practice (moved)');
    await coach.getByTestId('save-event').click();
    await expect(coach.getByText('Event updated')).toBeVisible();

    // Next week's practice is untouched.
    await coach.getByRole('button', { name: 'Next week' }).click();
    await expect(
      coach.getByTestId('event-row').filter({ hasText: 'Practice' }).first(),
    ).not.toContainText('moved');

    await openRow(coach, 'Practice');
    await coach.getByTestId('edit-event').click();
    await coach.getByRole('radio', { name: 'All events' }).click();
    await coach.getByLabel('Title').fill('Skills practice');
    await coach.getByTestId('save-event').click();
    await expect(coach.getByText('Updated 3 events')).toBeVisible();
  });

  test('staff cancel an occurrence and families still see it, struck through', async () => {
    await coach.getByRole('button', { name: 'Next week' }).click();
    await openRow(coach, 'Skills practice');
    await coach.getByTestId('cancel-event').click();
    await coach.getByRole('radio', { name: 'This event' }).click();
    await coach.getByLabel('Reason (shown to families)').fill('Field closed');
    await coach.getByTestId('confirm-cancel').click();
    await expect(coach.getByTestId('cancelled-banner')).toContainText('Field closed');

    // Families land on the Agenda, which lists the next 60 days.
    await parentA.goto('/schedule');
    await expect(
      parentA.getByTestId('event-row').filter({ hasText: 'Cancelled: Field closed' }),
    ).toBeVisible();
  });

  test('staff enter a result for a game that has started', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await coach.getByTestId('new-event').click();
    await coach.getByRole('radio', { name: 'Game' }).click();
    await coach.getByLabel('Title').fill('Early game');
    await pickDate(coach, 'Date', todayKey());
    await pickTime(coach, 'Starts', '00:00');
    await pickTime(coach, 'Ends', '00:30');
    await coach.getByTestId('save-event').click();
    await openRow(coach, 'Early game');
    await coach.getByTestId('enter-result').click();
    await coach.getByLabel('Us (goals)').fill('3');
    await coach.getByLabel('Them', { exact: true }).fill('2');
    await coach.getByTestId('save-result').click();
    await expect(coach.getByTestId('result-line')).toContainText('Won 3–2');
    // Staff default to Week, which has no result chip; the Past agenda shows it with the record.
    await coach.goto(`${teamUrl}/schedule?view=agenda&when=past`);
    await expect(coach.getByTestId('event-row').filter({ hasText: 'Early game' })).toContainText(
      'W 3–2',
    );
    await expect(coach.getByTestId('record-header')).toBeVisible();
  });

  test('staff nudge families who have not replied, once, then it is rate limited', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Game vs. Hawks');
    await expect(coach.getByTestId('nudge')).toBeEnabled();
    await coach.getByTestId('nudge').click();
    await expect(coach.getByText(/Remind \d+ famil/)).toBeVisible();
    await coach.getByRole('button', { name: 'Send reminder' }).click();
    await expect(coach.getByText(/Reminded \d+ famil/)).toBeVisible();
    // A second nudge inside 6 hours is refused by the database.
    await coach.getByTestId('nudge').click();
    await coach.getByRole('button', { name: 'Send reminder' }).click();
    await expect(coach.getByText('Already reminded recently. Try again later.')).toBeVisible();
  });

  test('a parent sees a chip on the row, filters to Needs reply, and replies from the row', async () => {
    await parentB.goto('/schedule');
    const row = parentB.getByTestId('event-row').filter({ hasText: 'Game vs. Hawks' });
    await expect(row.getByTestId('rsvp-chip')).toContainText('Ben: No reply');
    await expect(row).toContainText('Needs reply');

    await parentB.goto('/schedule?needs=1');
    const needs = parentB.getByTestId('event-row').filter({ hasText: 'Game vs. Hawks' });
    await expect(needs).toBeVisible();
    await needs.getByRole('button', { name: 'Ben: Going' }).click();
    // Answered, so it leaves the Needs reply list.
    await expect(parentB.getByTestId('event-row').filter({ hasText: 'Game vs. Hawks' })).toHaveCount(0);
    await parentB.goto('/schedule');
    await expect(
      parentB.getByTestId('event-row').filter({ hasText: 'Game vs. Hawks' }).getByTestId('rsvp-chip'),
    ).toContainText('Ben: Going');
  });

  test('staff set an RSVP for a player, Maybe shows in the counts, and names stay staff-only', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Game vs. Hawks');
    await coach.getByRole('button', { name: /Set RSVP for Ava/ }).click();
    await coach.getByRole('group', { name: /Set RSVP for Ava/ }).getByRole('button', { name: 'Maybe' }).click();
    const ava = coach.getByTestId('rsvp-row').filter({ hasText: 'Ava Adams' });
    await expect(ava).toContainText('Maybe');
    await expect(ava).toContainText('Set by staff');
    await expect(coach.getByTestId('rsvp-counts')).toHaveAttribute('aria-label', /1 maybe/);
    await coach.getByRole('button', { name: 'No reply' }).click();
    await expect(coach.getByTestId('rsvp-row')).toHaveCount(0);

    await parentB.goto('/schedule');
    await openRow(parentB, 'Game vs. Hawks');
    await expect(parentB.getByTestId('rsvp-counts')).toHaveAttribute('aria-label', /1 maybe/);
    await expect(parentB.getByTestId('event-drawer')).not.toContainText('Ava');
  });

  test('delete is blocked once families have replied, with "Cancel instead"', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Game vs. Hawks');
    await expect(coach.getByTestId('delete-event')).toBeDisabled();
    await expect(coach.getByTestId('delete-blocked')).toContainText('Cancel instead');
  });

  test('a time change shows Updated on the row and the previous time in the notice, until opened', async () => {
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();
    await coach.goto(`${teamUrl}/schedule`);
    await coach.getByTestId('new-event').click();
    await coach.getByLabel('Title').fill('Movable meetup');
    await pickDate(coach, 'Date', tomorrow);
    await pickTime(coach, 'Starts', '09:00');
    await pickTime(coach, 'Ends', '10:00');
    await coach.getByTestId('save-event').click();
    await expect(coach.getByText('Event added')).toBeVisible();

    await openRow(coach, 'Movable meetup');
    await coach.getByTestId('edit-event').click();
    await pickTime(coach, 'Starts', '10:00');
    await pickTime(coach, 'Ends', '11:00');
    await expect(coach.getByTestId('notify-note')).toContainText('Families will be notified');
    await coach.getByTestId('save-event').click();
    await expect(coach.getByText('Event updated')).toBeVisible();

    await parentA.goto('/schedule');
    const row = parentA.getByTestId('event-row').filter({ hasText: 'Movable meetup' });
    await expect(row).toContainText('Updated');
    await openRow(parentA, 'Movable meetup');
    await expect(parentA.getByTestId('updated-banner')).toContainText('Time moved from 9:00 AM to 10:00 AM');
    // Opening marked it seen: the chip is gone on the next visit.
    await parentA.goto('/schedule');
    await expect(
      parentA.getByTestId('event-row').filter({ hasText: 'Movable meetup' }),
    ).not.toContainText('Updated');
  });

  test('the repeat preview shows the count, and the cap is explained before saving', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await coach.getByTestId('new-event').click();
    await coach.getByLabel('Title').fill('Capped practice');
    await coach.getByRole('radio', { name: 'Weekly' }).click();
    await coach
      .getByRole('group', { name: 'Repeat on' })
      .getByRole('button', { name: 'Mon', exact: true })
      .click();
    await coach.getByLabel('Number of events').fill('3');
    await expect(coach.getByTestId('repeat-preview')).toContainText('Creates 3 practices');
    await coach.getByLabel('Number of events').fill('60');
    await expect(coach.getByTestId('repeat-preview')).toContainText('at most 52');
    await expect(coach.getByTestId('save-event')).toBeDisabled();
  });

  test('the series scope shows what each choice does', async () => {
    await coach.goto(`${teamUrl}/schedule`);
    await openRow(coach, 'Skills practice');
    await coach.getByTestId('edit-event').click();
    const scope = coach.getByTestId('scope-picker');
    await expect(scope).toContainText('Only this event changes');
    await expect(scope).toContainText('This event and every later one');
    await expect(scope).toContainText('Every event in the series changes');
  });

  test('the calendar feed serves a parseable ICS, and rotate / turn off revoke the old link', async () => {
    await parentA.goto('/schedule');
    await parentA.getByTestId('schedule-more').click();
    await parentA.getByRole('button', { name: /Calendar link/ }).click();
    await parentA.getByTestId('create-feed').click();
    const url = (await parentA.getByTestId('feed-url').textContent())?.trim() ?? '';
    expect(url).toMatch(/\/functions\/v1\/calendar-feed\/[0-9a-f]{64}\.ics$/);

    const res = await parentA.request.get(url);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/calendar');
    const ics = await res.text();
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    // The child's team events, with stable UIDs, local times in the event's zone, and cancelled events marked.
    expect(ics).toContain('SUMMARY:Game vs. Hawks');
    expect(ics).toMatch(/DTSTART;TZID=[A-Za-z_/]+:\d{8}T\d{6}/);
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).not.toMatch(/Ava|Adams|Ben|Brown/);
    // The link itself is the credential: a wrong token and a missing token are 404.
    expect((await parentA.request.get(url.replace(/[0-9a-f]{64}/, '0'.repeat(64)))).status()).toBe(
      404,
    );

    await parentA.getByRole('button', { name: 'Reset link' }).click();
    await expect(parentA.getByTestId('feed-url')).not.toHaveText(url);
    const rotated = (await parentA.getByTestId('feed-url').textContent())?.trim() ?? '';
    expect(rotated).not.toBe(url);
    expect((await parentA.request.get(url)).status()).toBe(404);
    expect((await parentA.request.get(rotated)).status()).toBe(200);

    await parentA.getByRole('button', { name: 'Turn off' }).click();
    await expect(parentA.getByText('Calendar link turned off')).toBeVisible();
    expect((await parentA.request.get(rotated)).status()).toBe(404);
  });
});

/**
 * A notification tap opens /events/<id>. Signed out, the proxy sends the visitor to sign-in with the
 * path in `next`; after signing in they land on that exact event page.
 */
test('a schedule notification link survives sign-in', async ({ browser }) => {
  const { page } = await newSession(browser);
  const path = '/events/11111111-1111-4111-8111-111111111111';
  await page.goto(path);
  await expect(page).toHaveURL(
    new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%/g, '%')}`),
  );
  await signUp(page, 'sc-link', 'Lee Link', path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByTestId('event-page')).toBeVisible();
  await expect(page.getByText('Event not found')).toBeVisible();
  await cleanup();
});

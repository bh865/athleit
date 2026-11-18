import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, signUp } from './helpers';

/**
 * Route crawl: every signed-in page has exactly one PageHeader h1, it is not inside a card, and it
 * sits at the same place on every page. Also checks that no page scrolls sideways at 360, 768 and
 * 1280 wide. Needs the hosted test project (it signs up a user, a team, a club and a child).
 */
test.describe.serial('page headers', () => {
  let page: Page;
  let teamId = '';
  let clubId = '';
  let childId = '';

  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await signUp(page, 'headers', 'Hedda Header');
    await page.goto('/clubs/new');
    await page.getByLabel('Club name').fill('Header Club');
    await page.getByRole('button', { name: 'Create club' }).click();
    await page.waitForURL(/\/clubs\/[0-9a-f-]{36}$/);
    clubId = page.url().split('/').pop()!;
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Header Team');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    teamId = page.url().split('/').pop()!;
    await page.goto('/family/children/new');
    await page.getByLabel('First name').fill('Chi');
    await page.getByLabel('Last name').fill('Ld');
    await pickDate(page, 'Date of birth', '2016-04-02');
    await page.getByRole('button', { name: 'Add child' }).click();
    await page.getByTestId('children-list').waitFor();
    childId = (await page
      .getByTestId('children-list')
      .getByRole('link')
      .first()
      .getAttribute('href'))!
      .split('/')
      .pop()!;
  });
  test.afterAll(async () => {
    await cleanup();
  });

  const routes = () => [
    '/',
    '/schedule',
    '/messages',
    '/messages/new',
    '/pay',
    '/notifications',
    '/notifications/settings',
    '/family',
    '/family/children/new',
    `/family/children/${childId}`,
    '/join',
    '/teams/new',
    '/clubs/new',
    `/teams/${teamId}`,
    `/teams/${teamId}/schedule`,
    `/teams/${teamId}/payments`,
    `/teams/${teamId}/requests`,
    `/teams/${teamId}/invites`,
    `/teams/${teamId}/members`,
    `/teams/${teamId}/settings`,
    `/clubs/${clubId}`,
    `/clubs/${clubId}/payments`,
    '/events/00000000-0000-0000-0000-000000000000',
  ];

  test('every page has one h1 PageHeader, outside any card, at the same position', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    let first: { x: number; y: number } | null = null;
    for (const path of routes()) {
      await page.goto(path);
      await page.getByTestId('page-header').first().waitFor();
      const headers = page.getByTestId('page-header');
      await expect(headers, path).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
      const inCard = await page
        .getByTestId('page-header')
        .evaluate((el) => el.closest('[class*="card"]') !== null);
      expect(inCard, `${path}: header must not sit in a card`).toBe(false);
      const box = (await headers.boundingBox())!;
      first ??= { x: box.x, y: box.y };
      expect(Math.abs(box.x - first.x), `${path} x`).toBeLessThan(2);
      expect(Math.abs(box.y - first.y), `${path} y`).toBeLessThan(2);
    }
  });

  for (const width of [360, 768, 1280]) {
    test(`no sideways scroll at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/', '/schedule', '/messages', '/pay', '/family', `/teams/${teamId}`]) {
        await page.goto(path);
        await page.getByTestId('page-header').first().waitFor();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});

import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, pickTime, signUp } from './helpers';

/**
 * Address search: type, pick, save the place, and see "Open in Maps" with the place id on the event page.
 * The `places` Edge Function is mocked (no Google key or network call is needed); everything else is real.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function mockPlaces(page: Page, seen: { actions: string[]; tokens: Set<string> }) {
  await page.route('**/functions/v1/places', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = req.postDataJSON() as { action: string; sessionToken: string };
    seen.actions.push(body.action);
    seen.tokens.add(body.sessionToken);
    if (body.action === 'autocomplete')
      return route.fulfill({
        status: 200,
        headers: cors,
        json: {
          suggestions: [
            {
              placeId: 'ChIJe2e',
              name: 'Riverside Park',
              secondary: 'Austin, TX, USA',
              text: 'Riverside Park, Austin, TX, USA',
            },
          ],
        },
      });
    return route.fulfill({
      status: 200,
      headers: cors,
      json: {
        selection: {
          placeId: 'ChIJe2e',
          name: 'Riverside Park',
          formattedAddress: '1 Park Rd, Austin, TX 78701, USA',
          lat: 30.2,
          lng: -97.7,
          components: {
            line1: '1 Park Rd',
            city: 'Austin',
            region: 'TX',
            postal_code: '78701',
            country: 'US',
          },
        },
      },
    });
  });
}

test.describe.serial('place autocomplete', () => {
  let page: Page;
  const seen = { actions: [] as string[], tokens: new Set<string>() };
  test.beforeAll(async ({ browser }) => {
    page = (await newSession(browser)).page;
    await mockPlaces(page, seen);
    await signUp(page, 'placeauto', 'Cory Coach');
    await page.goto('/teams/new');
    await page.getByLabel('Team name').fill('Maps FC');
    await page.getByLabel('Season').fill('Fall');
    await page.getByRole('button', { name: 'Create team' }).click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
  });
  test.afterAll(cleanup);

  test('type, pick, save the place, and open it in Maps from the event page', async () => {
    await page.goto(`${new URL(page.url()).pathname}/schedule`);
    await page.getByTestId('new-event').click();
    await page.getByLabel('Title').fill('Practice at the park');
    await pickDate(page, 'Date', todayKey());
    await pickTime(page, 'Starts', '22:00');
    await pickTime(page, 'Ends', '22:50');
    await page.getByLabel('Location').selectOption({ label: 'Add a new place…' });

    const box = page.getByRole('combobox', { name: 'Place name or address' });
    await box.fill('riv');
    // Typing without picking shows the hint once the list is closed; the list itself has the attribution.
    const option = page.getByRole('option', { name: /Riverside Park/ });
    await expect(option).toBeVisible();
    await expect(page.getByText('Powered by Google')).toBeVisible();
    await option.click();

    await expect(page.getByTestId('place-verified')).toContainText('Address confirmed');
    await expect(page.getByLabel('Place name or address')).toHaveValue(
      '1 Park Rd, Austin, TX 78701, USA',
    );
    await page.getByRole('button', { name: 'Save for next time' }).click();
    await page.getByTestId('save-event').click();

    const row = page.getByTestId('event-row').filter({ hasText: 'Practice at the park' }).first();
    await expect(row).toBeVisible();
    await row.click();
    const link = page.getByRole('link', { name: 'Open in Maps' });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href')) ?? '';
    expect(href).toContain('https://www.google.com/maps/search/?api=1');
    expect(href).toContain('query_place_id=ChIJe2e');
    expect(href).toContain(encodeURIComponent('1 Park Rd, Austin, TX 78701, USA'));
  });

  test('one typing session shares a token, and a pick ends it', async () => {
    expect(seen.actions).toContain('autocomplete');
    expect(seen.actions.at(-1)).toBe('details');
    expect(seen.tokens.size).toBe(1);
  });

  test('typing without picking still saves, with a hint to pick', async () => {
    await page.getByTestId('new-event').click();
    await page.getByLabel('Title').fill('Practice somewhere');
    await pickDate(page, 'Date', todayKey());
    await pickTime(page, 'Starts', '21:00');
    await pickTime(page, 'Ends', '21:40');
    await page.getByLabel('Location').selectOption({ label: 'Add a new place…' });
    const box = page.getByRole('combobox', { name: 'Place name or address' });
    await box.fill('the back lot');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Pick a suggestion so the map is accurate')).toBeVisible();
    await page.getByTestId('save-event').click();
    await expect(
      page.getByTestId('event-row').filter({ hasText: 'Practice somewhere' }).first(),
    ).toBeVisible();
  });
});

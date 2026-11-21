import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Public help center. Needs no database users: /help is public and the articles ship with the app. Live values show
 * "(unavailable)" when the project has no get_public_help_values yet, which is also a valid state to test.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('home lists topics and recently updated articles, signed out', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Payments and receipts' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New and updated' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
});

test('skip link, then keyboard search opens an article', async ({ page }) => {
  await page.goto('/help');
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Search help' })).toBeFocused();
  await page.keyboard.type('waiver');
  const option = page.getByRole('option').first();
  await expect(option).toContainText('waiver', { ignoreCase: true });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/help\/a\/sign-a-waiver/);
});

test('a search with no results says so and carries the text into contact', async ({ page }) => {
  await page.goto('/help/search?q=zzzqqqxx');
  await expect(page.getByText('We couldn’t find that')).toBeVisible();
  await page.getByRole('link', { name: 'Contact support' }).last().click();
  await expect(page).toHaveURL(/\/help\/contact\?q=zzzqqqxx/);
  await expect(page.getByLabel('Subject')).toHaveValue('zzzqqqxx');
});

test('a category page lists its articles', async ({ page }) => {
  await page.goto('/help/c/team-subscription');
  await expect(page.getByRole('heading', { name: 'Team subscription' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Update your card or cancel/ })).toBeVisible();
});

test('an article shows the verified date, a generated role table and a way to get help', async ({
  page,
}) => {
  await page.goto('/help/a/start-your-teams-free-trial');
  await expect(page.getByRole('heading', { name: 'Start your team’s free trial' })).toBeVisible();
  await expect(page.getByText(/Last verified \d{4}-\d{2}-\d{2}/)).toBeVisible();
  // The role table is generated from capabilities.ts: only the team admin can manage billing.
  const row = (name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) });
  await expect(row('Team admin')).toContainText('Yes');
  await expect(row('Coach')).toContainText('No');
  // A live value is marked and explains itself; it is never typed into the article.
  await expect(page.locator('[data-live="trial_days"]').first()).toHaveAttribute(
    'title',
    'This updates automatically',
  );
  await expect(page.getByRole('link', { name: 'Contact support about this article' })).toHaveCount(
    0,
  ); // only after voting
  await page.getByRole('button', { name: 'No' }).click();
  await expect(
    page.getByRole('link', { name: 'Contact support about this article' }),
  ).toBeVisible();
});

test('article text never contains a literal price', async ({ page }) => {
  for (const slug of [
    'start-your-teams-free-trial',
    'update-your-card-or-cancel',
    'why-was-i-charged-a-service-fee',
  ]) {
    await page.goto(`/help/a/${slug}`);
    // Live values (<Live/>) are computed from config and marked data-live; only typed prices are forbidden.
    const typed = await page
      .locator('article')
      .evaluate((el) => {
        const c = el.cloneNode(true) as HTMLElement;
        c.querySelectorAll('[data-live]').forEach((n) => n.remove());
        return c.textContent ?? '';
      });
    expect(typed).not.toMatch(/\$\d/);
  }
});

test('Your requests asks you to sign in', async ({ page }) => {
  await page.goto('/help/requests');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('the emailed-link page for an unknown token says so and is not indexed', async ({ page }) => {
  await page.goto(`/help/r/${'a'.repeat(43)}`);
  await expect(page.getByText('We can’t find that request')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('embed mode hides the site header and footer (mobile in-app browser)', async ({ page }) => {
  await page.goto('/help/a/sign-a-waiver?embed=1');
  await expect(page.getByRole('heading', { name: 'Sign a waiver' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact support' }).first()).toBeHidden();
});

test('the search index for the mobile hub has no article bodies', async ({ request }) => {
  const res = await request.get('/help/index.json');
  expect(res.ok()).toBe(true);
  const docs = (await res.json()) as Record<string, unknown>[];
  expect(docs.length).toBeGreaterThanOrEqual(14);
  expect(Object.keys(docs[0]!).sort()).toEqual(['category', 'slug', 'summary', 'title']);
});

for (const path of [
  '/help',
  '/help/c/getting-started',
  '/help/a/pay-in-installments',
  '/help/search?q=zzzqqqxx',
  '/help/contact',
  '/help/whats-new',
]) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}

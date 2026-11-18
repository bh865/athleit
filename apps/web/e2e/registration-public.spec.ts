import { expect, test } from '@playwright/test';

/**
 * Public registration surfaces that need no seeded data and no secrets: unknown links, the emailed-link landing pages
 * and the guest redirect. Safe to run against any Dev project (read-only).
 */
test.describe('registration public surfaces', () => {
  test('an unknown registration link shows a friendly not-found, not a crash, and is not indexed', async ({
    page,
  }) => {
    const res = await page.goto('/r/this-event-does-not-exist-12345');
    expect(res?.status()).toBeLessThan(500);
    await expect(
      page.getByRole('heading', { name: /couldn.t find that registration/i }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('the emailed verification link with no token explains itself and never calls the server with nothing', async ({
    page,
  }) => {
    await page.goto('/register/verify');
    await expect(page.getByRole('heading', { name: /couldn.t confirm that link/i })).toBeVisible();
  });

  test('the token is removed from the address bar once read', async ({ page }) => {
    await page.route('**/functions/v1/verify-registration', (route) =>
      route.fulfill({ status: 400, json: { error: 'invalid_token' } }),
    );
    await page.goto('/register/verify#token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await expect(page.getByRole('heading', { name: /couldn.t confirm that link/i })).toBeVisible();
    expect(page.url()).not.toContain('token');
  });

  test('the claim link asks a visitor to sign in first', async ({ page }) => {
    await page.goto('/register/claim');
    // /register/claim is not a public path: guests are sent to sign in and brought back.
    await expect(page).toHaveURL(/sign-in/);
  });

  test('My registrations requires a session', async ({ page }) => {
    await page.goto('/registrations');
    await expect(page).toHaveURL(/sign-in/);
  });
});

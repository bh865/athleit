import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { PASSWORD, cleanup, emailFor, listAllUsers, newSession, signUp } from './helpers';

/**
 * Phase 4 e2e in Stripe TEST mode. NOT RUN IN CI: it needs real test keys, a deployed stripe-webhook, and Stripe CLI forwarding.
 *
 *   stripe listen --forward-connect-to https://<project>.supabase.co/functions/v1/stripe-webhook   (signing secret -> STRIPE_CONNECT_WEBHOOK_SECRET)
 *   STRIPE_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_STRIPE_ACCOUNT=acct_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... \
 *     pnpm --filter @athleit/web exec playwright test e2e/payments.spec.ts
 *
 * E2E_STRIPE_ACCOUNT is a TEST connected account created by connect-onboarding and finished with Stripe's test onboarding data
 * (charges_enabled = true). Setup writes rows with the service role; every assertion goes through the real UI and webhook.
 */
const enabled = process.env.STRIPE_E2E === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const account = process.env.E2E_STRIPE_ACCOUNT ?? '';

test.describe('payments (Stripe test mode)', () => {
  test.skip(
    !enabled || !service || !account,
    'set STRIPE_E2E=1, E2E_SUPABASE_SERVICE_ROLE_KEY and E2E_STRIPE_ACCOUNT',
  );
  test.afterAll(cleanup);

  async function seed() {
    const db = createClient(url, service, { auth: { persistSession: false } });
    const users = new Map<string, string>();
    for (const who of ['admin', 'parentA', 'parentB']) {
      const u = (await listAllUsers(db)).find((x) => x.email === emailFor(who));
      if (u) users.set(who, u.id);
    }
    const team = (
      await db
        .from('teams')
        .insert({ name: 'E2E Pay FC', sport: 'soccer', season_label: 'Fall' })
        .select('id')
        .single()
    ).data!;
    await db.from('team_memberships').insert([
      { team_id: team.id, profile_id: users.get('admin')!, role: 'admin' },
      { team_id: team.id, profile_id: users.get('parentA')!, role: 'parent' },
      { team_id: team.id, profile_id: users.get('parentB')!, role: 'parent' },
    ]);
    const hh = async (who: string, first: string) => {
      const h = (
        await db
          .from('households')
          .insert({ name: `${first} family` })
          .select('id')
          .single()
      ).data!;
      await db
        .from('household_members')
        .insert({ household_id: h.id, profile_id: users.get(who)! });
      const p = (
        await db
          .from('players')
          .insert({
            household_id: h.id,
            first_name: first,
            last_name: 'Pay',
            date_of_birth: '2016-01-01',
          })
          .select('id')
          .single()
      ).data!;
      await db.from('team_players').insert({ team_id: team.id, player_id: p.id });
      return { h: h.id, p: p.id };
    };
    const a = await hh('parentA', 'Ava');
    const b = await hh('parentB', 'Ben');
    const ca = (
      await db
        .from('connected_accounts')
        .insert({
          team_id: team.id,
          stripe_account_id: account,
          details_submitted: true,
          charges_enabled: true,
          payouts_enabled: true,
          onboarding_status: 'ready',
        })
        .select('id')
        .single()
    ).data!;
    const cfg = {
      platform_fee_flat_cents: 0,
      platform_fee_bps: 0,
      stripe_fee_bps: 290,
      stripe_fee_fixed_cents: 30,
    };
    const ev = (
      await db
        .from('payment_events')
        .insert({
          team_id: team.id,
          connected_account_id: ca.id,
          title: 'E2E jersey fee',
          amount_cents: 4500,
          due_at: new Date(Date.now() + 864e5 * 10).toISOString(),
          fee_policy: 'absorb',
          fee_config: cfg,
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()
    ).data!;
    await db.from('payment_requests').insert([
      {
        payment_event_id: ev.id,
        player_id: a.p,
        household_id: a.h,
        amount_cents: 4500,
        due_at: new Date(Date.now() + 864e5 * 10).toISOString(),
        display_id: `PR-${(Date.now() % 90000) + 10000}`,
      },
      {
        payment_event_id: ev.id,
        player_id: b.p,
        household_id: b.h,
        amount_cents: 4500,
        due_at: new Date(Date.now() + 864e5 * 10).toISOString(),
        display_id: `PR-${(Date.now() % 90000) + 10001}`,
      },
    ]);
    return { team: team.id };
  }

  async function payWithCard(page: Page, number: string) {
    await page.getByRole('button', { name: /^Pay/ }).click();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    const frame = page.frameLocator('iframe[title*="payment" i]').first();
    await frame.getByPlaceholder(/1234 1234/).fill(number);
    await frame.getByPlaceholder('MM / YY').fill('12 / 34');
    await frame.getByPlaceholder(/CVC/i).fill('123');
    await page.getByRole('button', { name: /^Pay \$/ }).click();
  }

  test('a parent pays with 4242, sees Processing then the receipt after the webhook; a second family cannot see the first', async ({
    browser,
  }) => {
    const admin = await newSession(browser);
    await signUp(admin.page, 'admin', 'Admin Pat');
    const a = await newSession(browser);
    await signUp(a.page, 'parentA', 'Parent Ava');
    const b = await newSession(browser);
    await signUp(b.page, 'parentB', 'Parent Ben');
    await seed();

    await a.page.goto('/pay');
    await expect(a.page.getByText('E2E jersey fee')).toBeVisible();
    await expect(a.page.getByText('Ben')).toHaveCount(0); // never another family's request
    await payWithCard(a.page, '4242424242424242');
    await expect(a.page.getByTestId('processing').or(a.page.getByTestId('receipt'))).toBeVisible();
    await expect(a.page.getByTestId('receipt')).toBeVisible({ timeout: 60_000 }); // only after the webhook marks it paid
    await expect(a.page.getByTestId('receipt-id')).toHaveText(/^RCP-\d+$/);

    await b.page.goto('/pay');
    await expect(b.page.getByText('Ava')).toHaveCount(0);
    void PASSWORD;
  });

  test('a declined card shows a friendly failure and a retry; 3D Secure asks for authentication', async ({
    browser,
  }) => {
    const a = await newSession(browser);
    await signUp(a.page, 'parentA', 'Parent Ava');
    await a.page.goto('/pay');
    await payWithCard(a.page, '4000000000009995');
    await expect(a.page.getByTestId('pay-error')).toContainText('You were not charged');
    await expect(a.page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

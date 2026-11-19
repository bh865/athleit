import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, emailFor, listAllUsers, newSession, signUp } from './helpers';

/**
 * Installment plans (docs/split-payments.md), Stripe TEST mode. NOT RUN IN CI: same setup as payments.spec.ts (real test keys,
 * a deployed stripe-webhook, Stripe CLI forwarding, E2E_STRIPE_ACCOUNT with charges enabled).
 *
 *   STRIPE_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... E2E_STRIPE_ACCOUNT=acct_... NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... \
 *     pnpm --filter @athleit/web exec playwright test e2e/payment-plans.spec.ts
 *
 * Covers: staff choosing plan options and seeing the fee impact (with an Axe scan), a family choosing a plan and completing
 * checkout (autopay consent shown and off by default), the plan detail panel, and staff paying one installment offline and
 * waiving another.
 */
const enabled = process.env.STRIPE_E2E === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const account = process.env.E2E_STRIPE_ACCOUNT ?? '';

async function noSeriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
}

test.describe('payment plans (Stripe test mode)', () => {
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
        .insert({ name: 'E2E Plan FC', sport: 'soccer', season_label: 'Fall' })
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
            last_name: 'Plan',
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
          title: 'E2E plan fee',
          amount_cents: 9000,
          plan_options: [1, 3],
          plan_cadence: 'weekly',
          due_at: new Date(Date.now() + 864e5 * 40).toISOString(),
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
        amount_cents: 9000,
        due_at: new Date(Date.now() + 864e5 * 40).toISOString(),
        display_id: `PR-${(Date.now() % 90000) + 10000}`,
      },
      {
        payment_event_id: ev.id,
        player_id: b.p,
        household_id: b.h,
        amount_cents: 9000,
        due_at: new Date(Date.now() + 864e5 * 40).toISOString(),
        display_id: `PR-${(Date.now() % 90000) + 10001}`,
      },
    ]);
    return { team: team.id };
  }

  async function payWithCard(page: Page, number: string) {
    const frame = page.frameLocator('iframe[title*="payment" i]').first();
    await frame.getByPlaceholder(/1234 1234/).fill(number);
    await frame.getByPlaceholder('MM / YY').fill('12 / 34');
    await frame.getByPlaceholder(/CVC/i).fill('123');
    await page.getByRole('button', { name: /^Pay \$/ }).click();
  }

  test('staff choose plan options and see what a plan costs families (Axe clean)', async ({
    browser,
  }) => {
    const admin = await newSession(browser);
    await signUp(admin.page, 'admin', 'Admin Pat');
    const a = await newSession(browser);
    await signUp(a.page, 'parentA', 'Parent Ava');
    const b = await newSession(browser);
    await signUp(b.page, 'parentB', 'Parent Ben');
    const { team } = await seed();

    await admin.page.goto(`/teams/${team}/payments`);
    await admin.page.getByRole('button', { name: /new (payment )?request/i }).click();
    await admin.page.getByLabel('Title').fill('Season dues');
    await admin.page.getByLabel('Amount per player').fill('90.00');
    const plans = admin.page.getByTestId('plan-options');
    await expect(plans.getByLabel('Pay in full')).toBeChecked(); // default: nothing changes for existing habits
    await plans.getByLabel('3 payments').check();
    await expect(plans.getByLabel('Payments are spaced')).toBeVisible();
    await noSeriousViolations(admin.page);
  });

  test('a family chooses a plan, consents to autopay explicitly and completes the first payment', async ({
    browser,
  }) => {
    const a = await newSession(browser);
    await signUp(a.page, 'parentA', 'Parent Ava');
    await a.page.goto('/pay');
    await expect(a.page.getByText('E2E plan fee')).toBeVisible();
    await a.page.getByRole('button', { name: /^Pay/ }).first().click();

    const step = a.page.getByTestId('plan-step');
    await expect(step).toBeVisible();
    await expect(step.getByLabel('Pay in full')).toBeChecked();
    await step.getByLabel(/3 payments/).check();
    const consent = a.page.getByTestId('autopay-consent');
    await expect(consent).toContainText('I authorize');
    await expect(consent.getByRole('checkbox')).not.toBeChecked(); // opt in, never a default
    await noSeriousViolations(a.page);
    await consent.getByRole('checkbox').check();
    await step.getByRole('button', { name: 'Continue' }).click();

    const review = a.page.getByTestId('plan-review');
    await expect(review).toContainText('Total across all payments');
    await expect(review).toContainText('Today');
    await review.getByRole('button', { name: /^Pay \$.* now/ }).click();
    await payWithCard(a.page, '4242424242424242');
    await expect(a.page.getByTestId('receipt')).toBeVisible({ timeout: 60_000 }); // after the webhook settles installment 1
    await a.page.getByRole('button', { name: /done/i }).click();

    // The plan detail: one paid, two scheduled, ways to pay ahead.
    const card = a.page.getByTestId('plan-card');
    await expect(card).toContainText('1 of 3 paid');
    await expect(
      card.getByRole('list', { name: 'Installments' }).getByRole('listitem'),
    ).toHaveCount(3);
    await expect(card.getByRole('button', { name: 'Pay next installment' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Pay remaining balance' })).toBeVisible();
    await noSeriousViolations(a.page);

    // Another family never sees this plan.
    const b = await newSession(browser);
    await signUp(b.page, 'parentB', 'Parent Ben');
    await b.page.goto('/pay');
    await expect(b.page.getByTestId('plan-card')).toHaveCount(0);
  });

  test('staff mark an installment paid offline and waive another', async ({ browser }) => {
    const admin = await newSession(browser);
    await signUp(admin.page, 'admin', 'Admin Pat');
    const { team } = await seed();
    await admin.page.goto(`/teams/${team}/payments`);
    await admin.page.getByText('E2E plan fee').click();
    await admin.page.getByRole('button', { name: 'Plan' }).first().click();
    const sheet = admin.page.getByTestId('plan-sheet');
    await expect(sheet.getByTestId('installment-row')).toHaveCount(3);
    await sheet
      .getByTestId('installment-row')
      .nth(1)
      .getByRole('button', { name: 'Paid offline' })
      .click();
    await expect(sheet.getByTestId('installment-row').nth(1)).toContainText('Paid offline');
    await sheet
      .getByTestId('installment-row')
      .nth(2)
      .getByRole('button', { name: 'Waive' })
      .click();
    await expect(sheet.getByTestId('installment-row').nth(2)).toContainText('Waived');
    await noSeriousViolations(admin.page);
  });
});

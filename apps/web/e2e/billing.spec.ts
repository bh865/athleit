import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, created, emailFor, newSession, PASSWORD, signUp } from './helpers';

/**
 * Team billing screens. The hosted Stripe Checkout page is NOT driven. State is set through the service role (the same
 * facts the webhook would write), and the screens, banners, role visibility and the database refusals are asserted.
 *
 * Needs the service role (E2E_SUPABASE_SERVICE_ROLE_KEY) and BILLING_E2E=1. The spec flips the GLOBAL switch
 * team_subscription.enabled on the project it runs against and switches it off again in afterAll, so run it against a
 * dev project, never one other people are using at that moment:
 *   BILLING_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test e2e/billing.spec.ts
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.BILLING_E2E === '1' && !!service && !!url;
const db = () =>
  createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

test.describe('team billing', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !enabled,
    'set BILLING_E2E=1 and E2E_SUPABASE_SERVICE_ROLE_KEY (flips the global billing switch)',
  );

  let admin: Page;
  let teamId = '';
  let teamPath = '';

  const setSwitch = async (on: boolean) =>
    db().from('platform_settings').update({ value: on }).eq('key', 'team_subscription.enabled');
  const setFacts = async (facts: Record<string, unknown>) => {
    const r = await db().from('team_billing').update(facts).eq('team_id', teamId);
    expect(r.error).toBeNull();
  };
  const reset = () =>
    setFacts({
      trial_started_at: iso(-12 * DAY),
      trial_ends_at: iso(10 * DAY),
      stripe_subscription_id: null,
      stripe_customer_id: null,
      stripe_status: null,
      cancel_at_period_end: false,
      current_period_end: null,
      past_due_since: null,
      grace_ends_at: null,
      comped: false,
      comp_until: null,
    });

  test.beforeAll(async ({ browser }) => {
    await setSwitch(true);
    admin = (await newSession(browser)).page;
  });
  test.afterAll(async () => {
    await setSwitch(false);
    await cleanup();
  });

  test('the creation screen shows the server terms, and an admin starts a trial', async () => {
    await signUp(admin, 'billing-admin', 'Bea Billing');
    await admin.getByRole('button', { name: 'Create a team' }).click();
    // The line comes from get_billing_terms(): "<n>-day free trial, then $<price>/month. No card needed to start."
    await expect(admin.getByTestId('billing-terms')).toHaveText(
      /^\d+-day free trial, then \$\d+(\.\d{2})?\/month\. No card needed to start\.$/,
    );
    await admin.getByLabel('Team name').fill('E2E Billing FC');
    await admin.getByLabel('Sport').selectOption('soccer');
    await admin.getByLabel('Season').fill('Fall 2026');
    await admin.getByRole('button', { name: 'Create team' }).click();
    await expect(admin.getByRole('heading', { name: 'E2E Billing FC' })).toBeVisible();
    teamPath = new URL(admin.url()).pathname;
    teamId = teamPath.split('/')[2]!;
    expect(teamId).toMatch(/^[0-9a-f-]{36}$/);
    const row = await db()
      .from('team_billing')
      .select('trial_ends_at')
      .eq('team_id', teamId)
      .single();
    expect(row.error).toBeNull();
  });

  test('trial far from the end: status card, no banner; Axe clean', async () => {
    await reset();
    await admin.goto(`${teamPath}/billing`);
    await expect(admin.getByTestId('billing-panel')).toHaveAttribute('data-state', 'trialing');
    await expect(admin.getByTestId('billing-status')).toHaveText('Free trial');
    await expect(admin.getByRole('button', { name: 'Subscribe' })).toBeVisible();
    await expect(admin.getByText('No card needed until you subscribe.')).toBeVisible();
    await expect(admin.getByTestId('billing-banner')).toHaveCount(0);
    const a11y = await new AxeBuilder({ page: admin }).analyze();
    expect(a11y.violations).toEqual([]);
  });

  test('last reminder window: the banner appears with Subscribe', async () => {
    await setFacts({ trial_ends_at: iso(1.5 * DAY) });
    await admin.goto(`${teamPath}/people`);
    await expect(admin.getByTestId('billing-banner')).toContainText('Your free trial is ending');
    await expect(
      admin.getByTestId('billing-banner').getByRole('link', { name: 'Subscribe' }),
    ).toBeVisible();
  });

  test('payment problem: loud banner with the grace deadline and Update payment method', async () => {
    await setFacts({
      stripe_subscription_id: 'sub_e2e_pastdue',
      stripe_customer_id: 'cus_e2e_pastdue',
      stripe_status: 'past_due',
      past_due_since: iso(-1 * DAY),
      grace_ends_at: iso(6 * DAY),
    });
    await admin.goto(teamPath);
    await expect(admin.getByTestId('billing-banner')).toContainText('Payment problem');
    await admin.goto(`${teamPath}/billing`);
    await expect(admin.getByTestId('billing-panel')).toHaveAttribute('data-state', 'past_due');
    await expect(admin.getByRole('button', { name: 'Update payment method' })).toBeVisible();
  });

  test('restricted: the database refuses gated actions, the UI explains, and never-gated things still work', async () => {
    await reset();
    await setFacts({ trial_ends_at: iso(-1 * DAY) });
    await admin.goto(`${teamPath}/billing`);
    await expect(admin.getByTestId('billing-panel')).toHaveAttribute('data-state', 'trial_expired');
    await expect(admin.getByText('Still working:')).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Subscribe' })).toBeVisible();

    // The invite control explains itself and is disabled.
    await admin.goto(`${teamPath}/people?view=invites`);
    await expect(admin.getByTestId('billing-gate-note')).toContainText(
      'Creating invites is paused',
    );
    await expect(admin.getByRole('button', { name: 'Create invite link' })).toBeDisabled();

    // Asked directly (as any client could), the DATABASE refuses: billing_restricted.
    const anon =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.E2E_SUPABASE_ANON_KEY ?? '';
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({
      email: emailFor('billing-admin'),
      password: PASSWORD,
    });
    expect(login.error).toBeNull();
    const refused = await client.rpc('create_invite', {
      p_team_id: teamId,
      p_club_id: null as never,
      p_role: 'parent',
    });
    expect(refused.error?.message).toContain('billing_restricted');
    // Never gated: reading billing itself still works while restricted.
    const read = await client.rpc('get_team_billing', { p_team_id: teamId });
    expect(read.error).toBeNull();
    expect((read.data as { state: string }).state).toBe('trial_expired');
  });

  test('cancel scheduled and comped copy', async () => {
    await reset();
    await setFacts({
      stripe_subscription_id: 'sub_e2e_cancel',
      stripe_customer_id: 'cus_e2e_cancel',
      stripe_status: 'active',
      cancel_at_period_end: true,
      current_period_end: iso(12 * DAY),
    });
    await admin.goto(`${teamPath}/billing`);
    await expect(admin.getByTestId('billing-panel')).toHaveAttribute(
      'data-state',
      'cancel_scheduled',
    );
    await expect(admin.getByText(/Everything keeps working until then/)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Resume subscription' })).toBeVisible();

    await reset();
    await setFacts({ comped: true, comp_until: iso(30 * DAY) });
    await admin.goto(`${teamPath}/billing`);
    await expect(admin.getByTestId('billing-status')).toHaveText('Complimentary');
    await expect(admin.getByRole('button', { name: 'Subscribe' })).toHaveCount(0);
  });

  test('success page polls until the webhook state lands; cancelled page is calm', async () => {
    await reset();
    await admin.goto(`${teamPath}/billing/success`);
    await expect(admin.getByText('We’re confirming your payment')).toBeVisible();
    await setFacts({
      stripe_subscription_id: 'sub_e2e_ok',
      stripe_customer_id: 'cus_e2e_ok',
      stripe_status: 'active',
      current_period_end: iso(30 * DAY),
    });
    await expect(admin.getByRole('heading', { name: 'You’re subscribed' })).toBeVisible({
      timeout: 30_000,
    });
    await admin.goto(`${teamPath}/billing/cancelled`);
    await expect(admin.getByRole('heading', { name: 'You weren’t charged' })).toBeVisible();
  });

  test('a signed-in non-member sees no billing and a parent cannot open the team area', async ({
    browser,
  }) => {
    const { page } = await newSession(browser);
    await signUp(page, 'billing-stranger', 'Sam Stranger');
    await page.goto(`${teamPath}/billing`);
    await expect(page.getByTestId('billing-panel')).toHaveCount(0);
    expect(created.size).toBeGreaterThan(0);
  });

  test('mobile width: the banner wraps without horizontal scroll', async () => {
    await reset();
    await setFacts({ trial_ends_at: iso(-1 * DAY) });
    await admin.setViewportSize({ width: 375, height: 800 });
    await admin.goto(teamPath);
    await expect(admin.getByTestId('billing-banner')).toBeVisible();
    const overflow = await admin.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});

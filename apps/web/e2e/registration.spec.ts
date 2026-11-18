import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, signUp } from './helpers';

/**
 * Phase 5 end to end: an admin builds a form, a waiver and a registration in the UI and publishes it; a visitor
 * registers from the public link, confirms by email link, signs the waiver; the admin reviews, accepts and places.
 *
 * NOT RUN IN CI. It needs deployed Edge Functions and secrets:
 *   - CAPTCHA_SECRET = Cloudflare Turnstile TEST secret 1x0000000000000000000000000000000AA (always passes) on the project,
 *     and NEXT_PUBLIC_TURNSTILE_SITE_KEY = 1x00000000000000000000AA in apps/web/.env.local
 *   - E2E_SUPABASE_SERVICE_ROLE_KEY (test-only access: mint the verification token a real person would get by email)
 *
 *   REGISTRATION_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test e2e/registration.spec.ts
 */
const enabled = process.env.REGISTRATION_E2E === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test.describe.serial('registration (end to end)', () => {
  test.skip(!enabled || !service, 'set REGISTRATION_E2E=1 and E2E_SUPABASE_SERVICE_ROLE_KEY');
  test.afterAll(cleanup);

  let admin: Page;
  let visitor: Page;
  let teamUrl = '';
  let eventId = '';
  const slug = `e2e-spring-${Date.now().toString(36)}`;
  const token = `tok_${Date.now().toString(36)}_aaaaaaaaaaaaaaaaaaaaaaaa`;

  test.beforeAll(async ({ browser }) => {
    admin = (await newSession(browser)).page;
    visitor = (await newSession(browser)).page;
  });

  test('an admin creates a team, a form, a waiver and a registration', async () => {
    await signUp(admin, 'regadmin', 'Dana Admin');
    await admin.goto('/teams/new');
    await admin.getByLabel('Team name').fill('E2E Registration FC');
    await admin.getByLabel('Season').fill('Spring 2027');
    await admin.getByRole('button', { name: 'Create team' }).click();
    await admin.waitForURL(/\/teams\/[0-9a-f-]{36}$/);
    teamUrl = admin.url();
    const teamId = teamUrl.split('/').pop()!;

    // Form from a template, published.
    await admin.goto(`/manage/forms/new?team=${teamId}`);
    await admin.getByRole('button', { name: 'Use' }).first().click();
    await admin.getByRole('button', { name: /Publish version 1/ }).click();
    // The builder only moves to the edit route after create AND publish finished.
    await admin.waitForURL(/\/manage\/forms\/[0-9a-f-]{36}$/);
    await expect(admin.getByRole('button', { name: /Publish version 2/ })).toBeVisible();

    // Waiver, published.
    await admin.goto(`/manage/waivers/new?team=${teamId}`);
    await admin.getByLabel('Title', { exact: true }).fill('Liability waiver');
    await admin.getByLabel('Waiver text').fill('I agree to the terms of participation.');
    await admin.getByRole('button', { name: /Publish version 1/ }).click();
    // Creating then publishing swaps to the edit route, which drops the toast: the version list is the lasting proof.
    await admin.waitForURL(/\/manage\/waivers\/[0-9a-f-]{36}$/);
    await expect(admin.getByRole('heading', { name: 'Published versions' })).toBeVisible();

    // Registration event using both.
    await admin.goto(`/manage/registration/new?team=${teamId}`);
    await admin.getByLabel('Title', { exact: true }).fill('E2E Spring League');
    await admin.getByLabel('Web address').fill(slug);
    // Publishing needs an open window.
    await admin.getByLabel('Opens', { exact: true }).fill('2020-01-01T09:00');
    await admin.getByLabel('Closes', { exact: true }).fill('2099-01-01T09:00');
    await admin.getByLabel('Spots (leave blank for no limit)').fill('1');
    await admin.getByLabel('Registration form').selectOption({ index: 1 });
    await admin.getByLabel('Liability waiver').check();
    await admin.getByLabel('I will place accepted players on a team roster').check();
    await admin.getByLabel('Default team').selectOption({ label: 'E2E Registration FC' });
    await admin.getByRole('button', { name: 'Create draft' }).click();
    await admin.waitForURL(/\/manage\/registration\/[0-9a-f-]{36}$/);
    eventId = admin.url().split('/').pop()!;
    await admin.getByRole('button', { name: 'Publish' }).click();
    await expect(admin.getByText('open', { exact: true })).toBeVisible();
    await expect(admin.getByRole('img', { name: /QR code/ })).toBeVisible();
  });

  test('a visitor registers from the public link and is asked to confirm by email', async () => {
    await visitor.goto(`/r/${slug}`);
    await expect(visitor.getByRole('heading', { name: 'E2E Spring League' })).toBeVisible();
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/); // link-only by default
    await visitor.getByLabel('Child’s first name').fill('Ava');
    await visitor.getByLabel('Child’s last name').fill('Adams');
    await visitor.getByLabel('Child’s date of birth').fill('2016-04-02');
    await visitor.getByLabel('Your name').fill('Pat Parent');
    await visitor
      .getByLabel('Your email')
      .fill(`e2e-guardian-${Date.now().toString(36)}@example.test`);
    await visitor.getByRole('button', { name: 'Continue' }).click();
    await visitor.getByLabel(/Shirt size/).selectOption({ index: 1 });
    await visitor.getByLabel(/Emergency contact name/).fill('Sam Parent');
    await visitor.getByLabel(/Emergency contact phone/).fill('555-0100');
    await visitor.getByRole('button', { name: 'Continue' }).click();
    await visitor.getByLabel('I am this child’s parent or legal guardian.').check();
    await expect(visitor.getByRole('button', { name: 'Submit registration' })).toBeEnabled({
      timeout: 30_000,
    }); // Turnstile test key
    await visitor.getByRole('button', { name: 'Submit registration' }).click();
    await expect(visitor.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  });

  test('the emailed link confirms the registration and the visitor signs the waiver', async () => {
    // Stand in for the email: attach a verification token whose plaintext we know (only its hash is ever stored).
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { data: reg } = await db
      .from('registrations')
      .select('id, registration_event_id')
      .eq('registration_event_id', eventId)
      .eq('status', 'pending_verification')
      .single();
    await db.rpc('svc_issue_verification_token', {
      p_registration_id: reg!.id,
      p_token_hash: sha256(token),
      p_ttl_minutes: 60,
    });
    await visitor.goto(`/register/verify#token=${token}`);
    await expect(visitor.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
    expect(visitor.url()).not.toContain('token'); // removed from the address bar
    await visitor.getByLabel('Type your full legal name').fill('Pat Parent');
    await visitor.getByLabel('Email for your signed copy').fill('pat@example.test');
    await visitor.getByLabel(/agree to sign electronically/).check();
    await visitor.getByRole('button', { name: 'Sign waiver' }).click();
    await expect(visitor.getByText(/All waivers are signed/)).toBeVisible();
    // The same link cannot be used twice.
    await visitor.goto(`/register/verify#token=${token}`);
    await expect(
      visitor.getByRole('heading', { name: /couldn.t confirm that link/i }),
    ).toBeVisible();
  });

  test('the admin reviews, accepts and places the player; medical info stays behind an audited action', async () => {
    await admin.goto(`/manage/registration/${eventId}`);
    await expect(admin.getByText('Ava Adams')).toBeVisible();
    await admin.getByRole('button', { name: 'Ava Adams' }).click();
    await expect(admin.getByText('Allergies')).toHaveCount(0); // medical answers are not loaded with the detail
    await admin.getByRole('button', { name: 'Accept' }).click();
    await expect(admin.getByText('Accepted').first()).toBeVisible();
    await admin.getByRole('button', { name: 'Place on roster' }).click();
    await expect(admin.getByText('Placed on the roster')).toBeVisible();
    await admin.goto(teamUrl);
    await expect(admin.getByText('Ava Adams')).toBeVisible();
  });
});

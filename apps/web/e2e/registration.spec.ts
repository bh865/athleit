import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, newSession, pickDate, pickTime, signUp } from './helpers';

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

    // Form from a starter template, saved (publishes version 1).
    await admin.goto(`/manage/forms/new?team=${teamId}`);
    await admin.getByRole('button', { name: /Medical & Emergency/ }).click();
    await admin.getByRole('button', { name: 'Save form' }).click();
    await expect(admin.getByText('Saved', { exact: true })).toBeVisible();

    // Waiver, published (the builder asks for confirmation).
    await admin.goto(`/manage/waivers/new?team=${teamId}`);
    await admin.getByLabel('Waiver title').fill('Liability waiver');
    await admin.getByLabel('Waiver text').fill('I agree to the terms of participation.');
    await admin.getByRole('button', { name: 'Publish v1' }).first().click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Publish v1' }).click();
    await expect(admin.getByText(/v1 is live/)).toBeVisible();

    // Registration builder: Basics, Pricing, Dates, Form & waivers, Review. The title doubles as the web address.
    await admin.goto(`/manage/registration/new?team=${teamId}`);
    await admin.getByLabel('Registration name').first().fill(slug);
    await admin.getByLabel('Team', { exact: true }).selectOption({ label: 'E2E Registration FC' });
    await admin.getByLabel('Place accepted players on the roster').check();
    await admin.getByRole('button', { name: 'Continue' }).click();
    await admin.getByLabel('Maximum players').fill('1');
    await admin.getByRole('button', { name: 'Continue' }).click();
    // Publishing needs an open window.
    await pickDate(admin, 'Opens', '2020-01-01');
    await pickTime(admin, 'Opens time', '09:00');
    await pickDate(admin, 'Closes', '2040-01-01');
    await pickTime(admin, 'Closes time', '09:00');
    await admin.getByRole('button', { name: 'Continue' }).click();
    await admin.getByRole('radio', { name: /Medical & Emergency/ }).click();
    await admin.getByLabel('Liability waiver').check();
    await admin.getByRole('button', { name: 'Continue' }).click();
    await admin.getByRole('button', { name: 'Publish registration' }).click();
    await expect(admin.getByText('Registration is live')).toBeVisible();
    await expect(admin.getByRole('img', { name: /QR code/ })).toBeVisible();
    await admin.getByRole('button', { name: 'View registration' }).click();
    await admin.waitForURL(/\/manage\/registration\/[0-9a-f-]{36}$/);
    eventId = admin.url().split('/').pop()!;
  });

  test('a visitor registers from the public link and is asked to confirm by email', async () => {
    await visitor.goto(`/r/${slug}`);
    await expect(visitor.getByRole('heading', { name: slug })).toBeVisible();
    await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/); // link-only by default
    await visitor.getByLabel('Child’s first name').fill('Ava');
    await visitor.getByLabel('Child’s last name').fill('Adams');
    await pickDate(visitor, 'Child’s date of birth', '2016-04-02');
    await visitor.getByLabel('Your name').fill('Pat Parent');
    await visitor
      .getByLabel('Your email')
      .fill(`e2e-guardian-${Date.now().toString(36)}@example.test`);
    await visitor.getByRole('button', { name: 'Continue' }).click();
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

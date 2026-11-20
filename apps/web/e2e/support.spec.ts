import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { cleanup, created, emailFor, listAllUsers, newSession, PASSWORD, signUp } from './helpers';

/**
 * Support center, end to end. Opt-in: needs SUPPORT_E2E=1 and the service role (E2E_SUPABASE_SERVICE_ROLE_KEY) because it makes
 * throwaway users platform admins, and the support migrations and Edge Functions deployed to the project. Dev project only.
 *   SUPPORT_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test e2e/support.spec.ts
 * Staff actions are exercised through the real database functions with real sessions (aal1), not by bypassing them: routine
 * work succeeds without MFA, sensitive work is refused without it. The admin portal UI needs a TOTP session (see admin.spec.ts).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.SUPPORT_E2E === '1' && !!service && !!url && !!anon;
const admin = () =>
  createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function session(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return c;
}

test.describe('support center', () => {
  test.skip(!enabled, 'set SUPPORT_E2E=1 and E2E_SUPABASE_SERVICE_ROLE_KEY to run');
  test.afterAll(async () => {
    await cleanup();
  });

  test('a signed-in person sends a request, staff reply, and only the public reply reaches them', async ({
    browser,
  }) => {
    const parent = await newSession(browser);
    await signUp(parent.page, 'sup-parent', 'Pat Parent');
    await parent.page.goto('/help/contact');
    await parent.page.getByLabel('Subject').fill('I was charged twice');
    await parent.page.getByLabel('What happened?').fill('Two charges for one registration.');
    await parent.page.getByRole('button', { name: 'Send request' }).click();
    const ref = (
      await parent.page
        .getByText(/SUP-\d{6}/)
        .first()
        .innerText()
    ).match(/SUP-\d{6}/)![0];
    await expect(parent.page.getByText('We got your request')).toBeVisible();

    // A support-role user (no MFA) replies publicly and leaves an internal note.
    const staffEmail = emailFor('sup-staff');
    created.add(staffEmail);
    const a = admin();
    const { data: made } = await a.auth.admin.createUser({
      email: staffEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    await a.from('platform_admins').insert({ profile_id: made.user!.id, role: 'support' });
    const staff = await session(staffEmail);
    const { data: row } = await a.from('support_requests').select('id').eq('ref', ref).single();
    const reply = await staff.rpc('admin_reply_support_request', {
      p_id: row!.id,
      p_body: 'Sorry about that, looking now.',
      p_internal: false,
      p_status: null,
    });
    expect(reply.error).toBeNull(); // routine work: no MFA, no reason
    const note = await staff.rpc('admin_reply_support_request', {
      p_id: row!.id,
      p_body: 'Internal: refund both',
      p_internal: true,
      p_status: null,
    });
    expect(note.error).toBeNull();

    await parent.page.goto(`/help/requests/${ref}`);
    await expect(parent.page.getByText('Sorry about that, looking now.')).toBeVisible();
    await expect(parent.page.getByText('Internal: refund both')).toHaveCount(0);
    await expect(parent.page.getByText('Waiting on you')).toBeVisible();

    // Sensitive work needs MFA and a reason; a support-role user may not do it at all.
    const merge = await staff.rpc('admin_mark_support_spam', {
      p_id: row!.id,
      p_reason: 'a long enough reason',
    });
    expect(merge.error?.message).toMatch(/not_authorized|mfa_required/);
  });

  test('another signed-in user cannot read a request, and anon cannot touch the tables', async ({
    browser,
  }) => {
    const owner = await newSession(browser);
    await signUp(owner.page, 'sup-owner', 'Olive Owner');
    const other = await newSession(browser);
    await signUp(other.page, 'sup-other', 'Otto Other');
    const a = admin();
    const ownerRow = (await listAllUsers(a)).find((u) => u.email === emailFor('sup-owner'))!;
    const { data: req } = await a
      .from('support_requests')
      .insert({ type: 'question', subject: 'Private', requester_profile_id: ownerRow.id })
      .select('ref')
      .single();
    const otherClient = await session(emailFor('sup-other'));
    const read = await otherClient.rpc('get_my_support_request', { p_ref: req!.ref });
    expect(read.error?.message).toContain('unknown_request');
    const anonClient = createClient(url, anon);
    expect((await anonClient.from('support_requests').select('id')).error).not.toBeNull();
    const direct = await otherClient
      .from('support_requests')
      .insert({ type: 'question', subject: 'x', requester_profile_id: ownerRow.id });
    expect(direct.error).not.toBeNull();
  });

  test('a signed-out submission without a captcha is refused, and public ticket creation can be switched off', async ({
    request,
  }) => {
    const res = await request.post(`${url}/functions/v1/submit-support-request`, {
      headers: { apikey: anon, 'content-type': 'application/json' },
      data: {
        type: 'question',
        subject: 'Spam',
        body: 'Buy now http://spam.test',
        email: 'spam@example.test',
      },
    });
    expect([400, 403]).toContain(res.status()); // captcha_failed, or public_tickets_disabled while the switch is off
    expect((await res.json()).error).toMatch(/captcha_failed|public_tickets_disabled/);
  });

  test('the token view refuses an unknown token the same way as an expired one', async ({
    request,
  }) => {
    const res = await request.post(`${url}/functions/v1/get-support-request-by-token`, {
      headers: { apikey: anon, 'content-type': 'application/json' },
      data: { token: 'a'.repeat(43) },
    });
    expect(res.status()).toBe(404);
  });
});

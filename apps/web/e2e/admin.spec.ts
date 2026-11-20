import { createHmac } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { cleanup, created, emailFor, listAllUsers, newSession, PASSWORD, signUp } from './helpers';

/**
 * Admin portal (/admin). Opt-in: needs ADMIN_E2E=1 and the service role (E2E_SUPABASE_SERVICE_ROLE_KEY), because it makes
 * throwaway users platform admins. TOTP is real: the code is computed from the secret the setup screen shows, never bypassed.
 *   ADMIN_E2E=1 E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test e2e/admin.spec.ts
 * Run against a dev project only. The settings test changes one setting and restores it.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.ADMIN_E2E === '1' && !!service && !!url;
const db = () =>
  createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret.
function totp(secret: string, atMs = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/[\s=]/g, '').toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}
/** A code Supabase will accept now and has not seen: waits for the next 30 second window if the last code is still current. */
let lastCode = '';
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const c = totp(secret);
    if (c !== lastCode) {
      lastCode = c;
      return c;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function makeAdmin(email: string, role: 'support' | 'admin' | 'owner') {
  const user = (await listAllUsers(db())).find((u) => u.email === email);
  if (!user) throw new Error(`no user ${email}`);
  const { error } = await db().from('platform_admins').insert({ profile_id: user.id, role });
  expect(error).toBeNull();
  return user.id;
}
async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('app-main')).toBeVisible();
}

test.describe('admin portal', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!enabled, 'set ADMIN_E2E=1 and E2E_SUPABASE_SERVICE_ROLE_KEY');
  test.afterAll(async () => {
    await cleanup();
  });

  let secret = '';
  const ownerEmail = emailFor('admin-owner');

  test('a signed-in non-admin gets the ordinary not-found, never "access denied"', async ({
    browser,
  }) => {
    const { page, context } = await newSession(browser);
    await signUp(page, 'admin-plain', 'Plain User');
    for (const path of ['/admin', '/admin/settings']) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByText(/access denied|forbidden|not authorized/i)).toHaveCount(0);
    }
    await context.close();
  });

  test('an admin with no authenticator is sent to setup, and enrolling turns editing on', async ({
    browser,
  }) => {
    const { page, context } = await newSession(browser);
    await signUp(page, 'admin-owner', 'Owner One');
    await makeAdmin(ownerEmail, 'owner');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Set up two-step verification' })).toBeVisible();
    await page.getByText('Can’t scan? Enter this key').click();
    secret = ((await page.locator('code').first().textContent()) ?? '').replace(/\s/g, '');
    expect(secret.length).toBeGreaterThan(15);
    await page.getByLabel('6-digit code').fill(await freshCode(secret));
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Editing/ })).toBeVisible();
    await context.close();
  });

  test('a fresh sign-in is read-only; verifying flips it to editing', async ({ browser }) => {
    const { page, context } = await newSession(browser);
    await signIn(page, ownerEmail);
    await page.goto('/admin');
    await expect(page.getByText('You’re in read-only mode. Verify to make changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByLabel('6-digit code').fill(await freshCode(secret));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Editing/ })).toBeVisible();
    await context.close();
  });

  test('a write at aal1 opens the step-up sheet, keeps the change, applies it after verifying, and is audited', async ({
    browser,
  }) => {
    const key = 'team_subscription.grace_days';
    const before = (await db().from('platform_settings').select('value').eq('key', key).single())
      .data?.value;
    const { page, context } = await newSession(browser);
    await signIn(page, ownerEmail);
    await page.goto('/admin/settings');
    await page
      .getByRole('article', { name: 'Grace after a failed payment' })
      .getByRole('button', { name: 'Edit' })
      .click();
    const sheet = page.getByRole('alertdialog');
    await sheet.getByLabel('New value').fill('9');
    await sheet.getByLabel('Reason').fill('Playwright admin test');
    await sheet.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('dialog', { name: 'Verify to make this change' })).toBeVisible();
    await page.getByLabel('6-digit code').fill(await freshCode(secret));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
    await expect(sheet.getByText('Saved. This change is in the audit log.')).toBeVisible();
    const audit = await db()
      .from('platform_audit_log')
      .select('reason, before, after')
      .eq('action', 'setting.change')
      .eq('target_id', key)
      .order('at', { ascending: false })
      .limit(1)
      .single();
    expect(audit.data?.reason).toBe('Playwright admin test');
    expect(audit.data?.after).toEqual({ value: 9 });
    await db().from('platform_settings').update({ value: before }).eq('key', key); // restore
    await context.close();
  });

  test('support cannot see Payments and gets not-found for it', async ({ browser }) => {
    const { page, context } = await newSession(browser);
    await signUp(page, 'admin-support', 'Support Person');
    await makeAdmin(emailFor('admin-support'), 'support');
    created.add(emailFor('admin-support'));
    // Enrol so the shell renders (setup is the only screen otherwise).
    await page.goto('/admin');
    await page.getByText('Can’t scan? Enter this key').click();
    const s = ((await page.locator('code').first().textContent()) ?? '').replace(/\s/g, '');
    await page.getByLabel('6-digit code').fill(await freshCode(s));
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Payments and fees' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Admins' })).toHaveCount(0);
    expect((await page.goto('/admin/payments'))?.status()).toBe(404);
    expect((await page.goto('/admin/admins'))?.status()).toBe(404);

    // Phone width: only Overview, search and the queues; everything else is the calm "larger screen" state.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/teams');
    await expect(page.getByText('This page works best on a larger screen.')).toBeVisible();
    await page.goto('/admin/reports');
    await expect(page.getByText('This page works best on a larger screen.')).toHaveCount(0);
    await context.close();
  });
});

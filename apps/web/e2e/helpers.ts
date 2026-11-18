import { createClient } from '@supabase/supabase-js';
import { expect, type Browser, type Page } from '@playwright/test';

/** Every e2e user and what they created, so teardown can remove it. */
export const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const emailFor = (who: string) => `e2e-${RUN}-${who}@example.test`;
export const PASSWORD = 'e2e-Password-123';
export const created = new Set<string>();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY; // never committed, never in the app

const admin = () =>
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

export const canClean = () => admin() !== null;

/** Open a fresh, isolated browser session (its own cookies), like a second person's device. */
export async function newSession(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Sign up through the UI. If the project requires email confirmation, confirm via the admin API. */
export async function signUp(page: Page, who: string, name: string, next?: string) {
  const email = emailFor(who);
  created.add(email);
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  const needsConfirmation = page.getByText('Check your email to confirm');
  const landed = page.getByTestId('app-main');
  await expect(needsConfirmation.or(landed)).toBeVisible();
  if (await needsConfirmation.isVisible()) {
    const a = admin();
    if (!a)
      throw new Error(
        'Email confirmation is on: set E2E_SUPABASE_SERVICE_ROLE_KEY or turn confirmations off.',
      );
    const { data } = await a.auth.admin.listUsers({ perPage: 200 });
    const user = data.users.find((u) => u.email === email);
    if (!user) throw new Error(`user ${email} not found`);
    await a.auth.admin.updateUserById(user.id, { email_confirm: true });
    await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(landed).toBeVisible();
}

/** Delete everything the e2e users created, then the users. Teams first: the last-admin rule. */
export async function cleanup() {
  const a = admin();
  if (!a) {
    console.warn(
      `[e2e] No E2E_SUPABASE_SERVICE_ROLE_KEY: leaving test users e2e-${RUN}-* in place. Run bash scripts/e2e-cleanup.sh to remove them.`,
    );
    return;
  }
  const { data } = await a.auth.admin.listUsers({ perPage: 200 });
  const users = data.users.filter((u) => u.email && created.has(u.email));
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const { data: households } = await a
    .from('household_members')
    .select('household_id')
    .in('profile_id', ids);
  // Phase 5 registration data is immutable by design, so a team that published forms or took registrations is protected
  // by restrict foreign keys. Best effort: leave what the database protects (harmless example.test accounts).
  for (const table of ['teams', 'clubs'] as const) {
    const { data: rows } = await a.from(table).select('id').in('created_by', ids);
    for (const row of rows ?? []) await a.from(table).delete().eq('id', row.id); // one at a time: a protected one must not block the rest
  }
  await a
    .from('households')
    .delete()
    .in(
      'id',
      (households ?? []).map((h) => h.household_id),
    );
  for (const id of ids) {
    const { error } = await a.auth.admin.deleteUser(id);
    if (error)
      console.warn(`[e2e] kept user ${id}: ${error.message} (protected registration data)`);
  }
}

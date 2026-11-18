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

/** Every auth user, across pages (a single page misses newer users once the project has many). */
export async function listAllUsers(client: ReturnType<typeof createClient>) {
  const all: { id: string; email?: string }[] = [];
  for (let page = 1; page < 100; page++) {
    const { data } = await client.auth.admin.listUsers({ page, perPage: 200 });
    all.push(...data.users);
    if (data.users.length < 200) break;
  }
  return all;
}

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
    const user = (await listAllUsers(a)).find((u) => u.email === email);
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
  const users = (await listAllUsers(a)).filter((u) => u.email && created.has(u.email));
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const { data: households } = await a
    .from('household_members')
    .select('household_id')
    .in('profile_id', ids);
  await a.from('teams').delete().in('created_by', ids);
  await a.from('clubs').delete().in('created_by', ids);
  await a
    .from('households')
    .delete()
    .in(
      'id',
      (households ?? []).map((h) => h.household_id),
    );
  for (const id of ids) await a.auth.admin.deleteUser(id);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Choose a date (YYYY-MM-DD) in a <DatePicker> by its label: year, month, then the day. */
export async function pickDate(page: Page, label: string, iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  await page.getByRole('button', { name: new RegExp(`^${label}\\b`) }).click();
  const dialog = page.getByRole('dialog', { name: `Choose ${label}` });
  await dialog.getByRole('button', { name: /choose month and year/ }).click();
  await dialog.getByRole('button', { name: String(y), exact: true }).click();
  await dialog.getByRole('button', { name: MONTHS[m - 1]!.slice(0, 3), exact: true }).click();
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  await dialog.getByRole('button', { name: `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}` }).click();
}

/** Choose a time (HH:MM, 24 hour) in a <TimePicker>; minutes must be a multiple of 5. */
export async function pickTime(page: Page, label: string, hhmm: string) {
  const [h, min] = hhmm.split(':').map(Number) as [number, number];
  await page.getByRole('button', { name: new RegExp(`^${label}\\b`) }).click();
  const dialog = page.getByRole('dialog', { name: `Choose ${label}` });
  await dialog
    .getByRole('group', { name: 'Hour' })
    .getByRole('button', { name: String(h % 12 === 0 ? 12 : h % 12), exact: true })
    .click();
  await dialog
    .getByRole('group', { name: 'Minute' })
    .getByRole('button', { name: String(min).padStart(2, '0'), exact: true })
    .click();
  await dialog
    .getByRole('group', { name: 'AM or PM' })
    .getByRole('button', { name: h < 12 ? 'AM' : 'PM', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Done' }).click();
}

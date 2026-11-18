import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { cleanup, emailFor, listAllUsers, newSession, signUp } from './helpers';

/**
 * Regression for "No payment requests yet" on the Pay tab: the view follows what the person can do,
 * not which place is active. Needs the hosted TEST project and its service role key (setup only;
 * assertions go through the UI). No Stripe account is required.
 *
 *   E2E_SUPABASE_URL=https://<ref>.supabase.co E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test --project=chromium pay-views
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

test.describe('Pay views by capability', () => {
  test.skip(!service, 'set E2E_SUPABASE_SERVICE_ROLE_KEY');
  test.afterAll(cleanup);

  test('parent-only, staff-only and staff-plus-parent', async ({ browser }) => {
    const sessions = {
      parent: await newSession(browser),
      staff: await newSession(browser),
      both: await newSession(browser),
    };
    await signUp(sessions.parent.page, 'pvParent', 'Pam Parent');
    await signUp(sessions.staff.page, 'pvStaff', 'Sam Staff');
    await signUp(sessions.both.page, 'pvBoth', 'Bo Both');

    const db = createClient(url, service, { auth: { persistSession: false } });
    const all = await listAllUsers(db);
    const uid = (who: string) => all.find((u) => u.email === emailFor(who))!.id;

    const team = (
      await db
        .from('teams')
        .insert({ name: 'PV FC', sport: 'soccer', season_label: 'Fall' })
        .select('id')
        .single()
    ).data!;
    await db.from('team_memberships').insert([
      { team_id: team.id, profile_id: uid('pvParent'), role: 'parent' },
      { team_id: team.id, profile_id: uid('pvStaff'), role: 'admin' },
      { team_id: team.id, profile_id: uid('pvBoth'), role: 'admin' },
      { team_id: team.id, profile_id: uid('pvBoth'), role: 'parent' },
    ]);
    const due = new Date(Date.now() + 864e5 * 10).toISOString();
    const ev = (
      await db
        .from('payment_events')
        .insert({
          team_id: team.id,
          title: 'PV jersey fee',
          amount_cents: 4500,
          due_at: due,
          fee_policy: 'absorb',
          fee_config: {
            platform_fee_flat_cents: 0,
            platform_fee_bps: 0,
            stripe_fee_bps: 290,
            stripe_fee_fixed_cents: 30,
          },
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()
    ).data!;
    let n = Date.now() % 90000;
    for (const who of ['pvParent', 'pvBoth']) {
      const h = (
        await db
          .from('households')
          .insert({ name: `${who} family` })
          .select('id')
          .single()
      ).data!;
      await db.from('household_members').insert({ household_id: h.id, profile_id: uid(who) });
      const p = (
        await db
          .from('players')
          .insert({
            household_id: h.id,
            first_name: who,
            last_name: 'Kid',
            date_of_birth: '2016-01-01',
          })
          .select('id')
          .single()
      ).data!;
      await db.from('team_players').insert({ team_id: team.id, player_id: p.id });
      await db.from('payment_requests').insert({
        payment_event_id: ev.id,
        player_id: p.id,
        household_id: h.id,
        amount_cents: 4500,
        due_at: due,
        display_id: `PR-${10000 + n++}`,
      });
    }

    // The last-used context is the TEAM for everyone (the case that used to show the staff screen).
    for (const [key, role] of [
      ['parent', 'parent'],
      ['staff', 'admin'],
      ['both', 'admin'],
    ] as const) {
      await sessions[key].context.addInitScript(
        ([t, r]) => window.localStorage.setItem('athleit.context', `team:${t}:${r}`),
        [team.id, role],
      );
    }

    const { parent } = { parent: sessions.parent.page };
    await parent.goto('/pay');
    await expect(parent.getByText('PV jersey fee')).toBeVisible();
    await expect(parent.getByRole('radio', { name: 'Team collection' })).toHaveCount(0);
    await expect(parent.getByText('No payment requests yet')).toHaveCount(0);

    const staff = sessions.staff.page;
    await staff.goto('/pay');
    await expect(staff.getByText('New payment request')).toBeVisible();
    await expect(staff.getByRole('radio', { name: 'My payments' })).toHaveCount(0);

    const both = sessions.both.page;
    await both.goto('/pay');
    await expect(both.getByRole('radio', { name: 'My payments' })).toBeVisible();
    await expect(both.getByRole('radio', { name: 'Team collection' })).toBeVisible();
    await expect(both.getByText('New payment request')).toBeVisible();
    await both.getByRole('radio', { name: 'My payments' }).click();
    await expect(both.getByText('PV jersey fee')).toBeVisible();
  });
});

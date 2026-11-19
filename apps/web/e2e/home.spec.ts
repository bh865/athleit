import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { cleanup, emailFor, listAllUsers, newSession, signUp } from './helpers';

/**
 * Home follows capabilities, not the active place. Needs the hosted TEST project and its service role key
 * (setup only; assertions go through the UI).
 *
 *   E2E_SUPABASE_URL=https://<ref>.supabase.co E2E_SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @athleit/web exec playwright test --project=chromium home
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? '';
const service = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

test.describe('Home by capability', () => {
  test.skip(!service, 'set E2E_SUPABASE_SERVICE_ROLE_KEY');
  test.afterAll(cleanup);

  test('parent, coach, admin + parent and player', async ({ browser }) => {
    const keys = ['hmParent', 'hmCoach', 'hmBoth', 'hmPlayer'] as const;
    const sessions = Object.fromEntries(
      await Promise.all(keys.map(async (k) => [k, await newSession(browser)] as const)),
    ) as Record<(typeof keys)[number], Awaited<ReturnType<typeof newSession>>>;
    await signUp(sessions.hmParent.page, 'hmParent', 'Pam Parent');
    await signUp(sessions.hmCoach.page, 'hmCoach', 'Cal Coach');
    await signUp(sessions.hmBoth.page, 'hmBoth', 'Bo Both');
    await signUp(sessions.hmPlayer.page, 'hmPlayer', 'Pia Player');

    const db = createClient(url, service, { auth: { persistSession: false } });
    const all = await listAllUsers(db);
    const uid = (who: string) => all.find((u) => u.email === emailFor(who))!.id;

    const team = (
      await db
        .from('teams')
        .insert({ name: 'HM FC', sport: 'soccer', season_label: 'Fall' })
        .select('id')
        .single()
    ).data!;
    await db.from('team_memberships').insert([
      { team_id: team.id, profile_id: uid('hmParent'), role: 'parent' },
      { team_id: team.id, profile_id: uid('hmCoach'), role: 'coach' },
      { team_id: team.id, profile_id: uid('hmBoth'), role: 'admin' },
      { team_id: team.id, profile_id: uid('hmBoth'), role: 'parent' },
      { team_id: team.id, profile_id: uid('hmPlayer'), role: 'player' },
    ]);

    // One game tomorrow (inside the 48 hour RSVP window).
    const starts = new Date(Date.now() + 864e5);
    const ev = (
      await db
        .from('events')
        .insert({
          team_id: team.id,
          type: 'game',
          title: 'HM game',
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 36e5).toISOString(),
          timezone: 'America/New_York',
        })
        .select('id')
        .single()
    ).data!;

    const due = new Date(Date.now() + 864e5 * 3).toISOString();
    const paymentEvent = (
      await db
        .from('payment_events')
        .insert({
          team_id: team.id,
          title: 'HM jersey fee',
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

    let n = 50000 + (Date.now() % 40000);
    const playerIds: Record<string, string> = {};
    for (const who of ['hmParent', 'hmBoth']) {
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
            first_name: `${who}Kid`,
            last_name: 'Kid',
            date_of_birth: '2016-01-01',
          })
          .select('id')
          .single()
      ).data!;
      playerIds[who] = p.id;
      await db.from('team_players').insert({ team_id: team.id, player_id: p.id });
      await db.from('payment_requests').insert({
        payment_event_id: paymentEvent.id,
        player_id: p.id,
        household_id: h.id,
        amount_cents: 4500,
        due_at: due,
        display_id: `PR-${n++}`,
      });
    }

    // A pending join request for the coach and the admin to decide.
    await db.from('join_requests').insert({
      team_id: team.id,
      requester_id: uid('hmParent'),
      player_id: playerIds.hmParent!,
      message: 'hm',
    });

    for (const [key, role] of [
      ['hmParent', 'parent'],
      ['hmCoach', 'coach'],
      ['hmBoth', 'admin'],
      ['hmPlayer', 'player'],
    ] as const) {
      await sessions[key].context.addInitScript(
        ([t, r]) => window.localStorage.setItem('athleit.context', `team:${t}:${r}`),
        [team.id, role],
      );
    }

    // Parent: RSVP chip, amount due, RSVP from Home; no staff tiles.
    const parent = sessions.hmParent.page;
    await parent.goto('/');
    await expect(parent.getByTestId('home-attention')).toContainText('RSVP for hmParentKid');
    await expect(parent.getByTestId('due-card')).toBeVisible();
    await expect(parent.getByTestId('home-approvals')).toHaveCount(0);
    // The tiles that Home round 2 removed are gone for good.
    for (const id of [
      'home-week',
      'home-messages',
      'home-announcement',
      'home-payouts',
      'home-calendar',
      'home-notifications',
      'home-places',
    ])
      await expect(parent.getByTestId(id)).toHaveCount(0);
    await expect(parent.getByText('Your places')).toHaveCount(0);
    // RSVP resolves in place from the attention row ...
    const row = parent
      .getByTestId('home-attention')
      .getByRole('button', { name: 'hmParentKid: Going' });
    await row.click();
    await expect(
      parent.getByTestId('home-attention').getByRole('button', { name: 'hmParentKid: Going' }),
    ).toHaveCount(0);
    // ... and Next up still offers Going / Can't go per child.
    await expect(
      parent.getByTestId('next-up').getByRole('group', { name: /RSVP for hmParentKid/ }),
    ).toBeVisible();

    // Coach: RSVP counts and pending join requests; no amount due.
    const coach = sessions.hmCoach.page;
    await coach.goto('/');
    await expect(coach.getByRole('group', { name: 'RSVP counts' })).toBeVisible();
    await expect(coach.getByTestId('home-approvals')).toBeVisible();
    await expect(coach.getByTestId('due-card')).toHaveCount(0);

    // Admin + parent: both sets.
    const both = sessions.hmBoth.page;
    await both.goto('/');
    await expect(both.getByRole('group', { name: 'RSVP counts' })).toBeVisible();
    await expect(both.getByTestId('home-approvals')).toBeVisible();
    await expect(both.getByTestId('due-card')).toBeVisible();

    // Player 13+: no staff tiles, no join requests, no "New event".
    const player = sessions.hmPlayer.page;
    await player.goto('/');
    await expect(player.getByTestId('home-approvals')).toHaveCount(0);
    await expect(player.getByRole('group', { name: 'RSVP counts' })).toHaveCount(0);
    await expect(player.getByRole('link', { name: /New event/ })).toHaveCount(0);
    expect(ev.id).toBeTruthy();

    // Staff approve the join request in place from the attention row.
    await expect(coach.getByTestId('home-attention')).toContainText('1 join request');
    await coach.getByTestId('home-attention').getByRole('button', { name: 'Approve' }).click();
    await expect(coach.getByTestId('home-attention')).not.toContainText('join request');
  });
});

import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { PASSWORD, cleanup, emailFor, newSession, pickDate, signUp } from './helpers';

/**
 * Wave 2 + authorization negatives. Each persona signs in and visits every route it can see, recording console
 * errors, failed requests, a missing page heading and axe violations (soft, so one run reports everything).
 * Then an outsider tries the coach's team URLs and the database directly: nothing may leak.
 * Findings are written to test-results/crawl-report.json.
 */
// The Playwright process does not load .env.local; read the two public values the data checks need.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=(.*)$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const findings: { persona: string; path: string; kind: string; detail: string }[] = [];

async function visit(page: Page, persona: string, path: string, opts: { heading?: boolean } = {}) {
  const errors: string[] = [];
  const failed: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  };
  const onResponse = (r: { status(): number; url(): string }) => {
    if (r.status() >= 500) failed.push(`${r.status()} ${r.url().replace(/\?.*/, '').slice(0, 120)}`);
  };
  page.on('console', onConsole);
  page.on('response', onResponse);
  let status = 0;
  try {
    const res = await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });
    status = res?.status() ?? 0;
  } catch (e) {
    findings.push({ persona, path, kind: 'navigation', detail: String(e).slice(0, 160) });
  }
  page.off('console', onConsole);
  page.off('response', onResponse);
  if (status >= 500) findings.push({ persona, path, kind: 'status', detail: String(status) });
  for (const e of errors) findings.push({ persona, path, kind: 'console', detail: e });
  for (const f of failed) findings.push({ persona, path, kind: 'network', detail: f });
  if (opts.heading !== false && status < 400) {
    const n = await page.getByRole('heading', { level: 1 }).count();
    if (n === 0) findings.push({ persona, path, kind: 'no-h1', detail: '' });
  }
  if (status > 0 && status < 400) {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    for (const v of results.violations)
      findings.push({
        persona,
        path,
        kind: 'axe',
        detail: `${v.id}: ${v.nodes[0]?.target.join(' ')}`,
      });
  }
  return status;
}

test.describe.serial('persona crawl and authorization negatives', () => {
  let coach: Page;
  let parent: Page;
  let outsider: Page;
  let visitor: Page;
  let ctxs: BrowserContext[] = [];
  let teamId = '';
  let teamName = '';
  const run = Date.now().toString(36);

  test.beforeAll(async ({ browser }) => {
    const sessions = await Promise.all([1, 2, 3, 4].map(() => newSession(browser)));
    ctxs = sessions.map((s) => s.context);
    [coach, parent, outsider, visitor] = sessions.map((s) => s.page) as [Page, Page, Page, Page];
    teamName = `E2E Crawl ${run}`;
  });
  test.afterAll(async () => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/crawl-report.json', JSON.stringify(findings, null, 2));
    await cleanup();
  });

  test('setup: a coach with a team, a parent with a child, an outsider with nothing', async () => {
    await signUp(coach, 'crawl-coach', 'Casey Coach');
    await coach.goto('/teams/new');
    await coach.getByLabel('Team name').fill(teamName);
    await coach.getByLabel('Sport').selectOption('soccer');
    await coach.getByLabel('Season').fill('Fall 2026');
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach.getByRole('heading', { name: teamName })).toBeVisible();
    teamId = new URL(coach.url()).pathname.split('/')[2]!;
    expect(teamId).toMatch(/^[0-9a-f-]{36}$/);

    await signUp(parent, 'crawl-parent', 'Pat Parent');
    await parent.goto('/family/children/new');
    await parent.getByLabel('First name').fill('Ava');
    await parent.getByLabel('Last name').fill('Adams');
    await pickDate(parent, 'Date of birth', '2016-04-02');
    await parent.getByRole('button', { name: 'Add child' }).click();
    await expect(parent.getByTestId('children-list')).toContainText('Ava Adams');

    await signUp(outsider, 'crawl-outsider', 'Olive Outsider');
  });

  test('signed-out visitor: public routes', async () => {
    for (const p of [
      '/sign-in',
      '/sign-up',
      '/forgot-password',
      '/help',
      '/help/contact',
      '/help/whats-new',
      '/help/requests',
    ])
      await visit(visitor, 'visitor', p);
    // Protected routes bounce to sign-in rather than render.
    for (const p of ['/', '/roster', '/pay', `/teams/${teamId}`]) {
      await visitor.goto(p);
      await expect(visitor).toHaveURL(/\/sign-in/);
    }
  });

  test('new user with no places', async () => {
    for (const p of ['/', '/onboarding', '/onboarding/parent', '/onboarding/code', '/account', '/help'])
      await visit(outsider, 'new-user', p);
  });

  test('coach: every staff route', async () => {
    const t = `/teams/${teamId}`;
    for (const p of [
      '/', '/roster', '/schedule', '/pay', '/registrations', '/notifications', '/notifications/settings',
      '/family', '/account', '/messages', '/messages/new', t, `${t}/people`, `${t}/settings`,
      `${t}/payments`, `${t}/billing`, `${t}/forms`, `${t}/waivers`, `${t}/documents`,
      `${t}/registrations`, `/manage/forms/new?team=${teamId}`, `/manage/waivers/new?team=${teamId}`,
      `/manage/registration/new?team=${teamId}`, '/clubs/new', '/join', '/help/requests',
    ])
      await visit(coach, 'coach', p);
  });

  test('parent: family routes', async () => {
    for (const p of [
      '/', '/schedule', '/pay', '/registrations', '/notifications', '/family', '/family/children/new',
      '/account', '/messages', '/join', '/help/requests',
    ])
      await visit(parent, 'parent', p);
  });

  test('negatives: pages. An outsider and a parent get nothing from the coach team', async () => {
    const t = `/teams/${teamId}`;
    for (const [who, page] of [['outsider', outsider], ['parent', parent]] as const) {
      for (const p of [t, `${t}/people`, `${t}/settings`, `${t}/payments`, `${t}/billing`, `${t}/forms`,
        `${t}/waivers`, `${t}/documents`, `${t}/registrations`]) {
        const res = await page.goto(p, { waitUntil: 'networkidle' });
        const body = (await page.locator('body').innerText()).slice(0, 4000);
        const leaked = body.includes(teamName) || body.includes('Casey Coach');
        if (leaked) findings.push({ persona: who, path: p, kind: 'LEAK', detail: 'team name or staff name visible' });
        expect.soft(leaked, `${who} sees team data at ${p} (status ${res?.status()})`).toBe(false);
      }
    }
    // Admin portal: signed in non-admins must get not-found, never the portal.
    for (const [who, page] of [['coach', coach], ['parent', parent], ['outsider', outsider]] as const) {
      for (const p of ['/admin', '/admin/people', '/admin/payments', '/admin/support/tickets']) {
        const res = await page.goto(p);
        const body = await page.locator('body').innerText();
        const ok = res?.status() === 404 || /not found|couldn.t find|404/i.test(body);
        if (!ok) findings.push({ persona: who, path: p, kind: 'ADMIN-EXPOSED', detail: `status ${res?.status()}` });
        expect.soft(ok, `${who} must get not-found at ${p}`).toBe(true);
      }
    }
  });

  test('negatives: data. The outsider reads nothing of the coach team through the API', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    test.skip(!url || !anon, 'needs NEXT_PUBLIC_SUPABASE_URL and ANON key in the environment');
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email: emailFor('crawl-outsider'), password: PASSWORD });
    expect(error).toBeNull();
    const byTeam: [string, string][] = [
      ['teams', 'id'], ['team_memberships', 'team_id'], ['team_players', 'team_id'], ['join_requests', 'team_id'],
      ['events', 'team_id'], ['threads', 'team_id'], ['payment_requests', 'team_id'], ['forms', 'team_id'],
      ['waivers', 'team_id'], ['documents', 'team_id'], ['registrations', 'team_id'], ['invites', 'team_id'],
    ];
    for (const [table, col] of byTeam) {
      const { data, error: e } = await sb.from(table).select('*').eq(col, teamId);
      const rows = data?.length ?? 0;
      if (rows > 0) findings.push({ persona: 'outsider', path: `db:${table}`, kind: 'LEAK', detail: `${rows} rows` });
      expect.soft(rows, `outsider read ${rows} ${table} rows (error: ${e?.message ?? 'none'})`).toBe(0);
    }
    for (const table of ['messages', 'payments', 'players', 'households', 'profiles', 'audit_log', 'stripe_webhook_events', 'platform_admins']) {
      const { data } = await sb.from(table).select('*').limit(50);
      const rows = data?.length ?? 0;
      const allowedOwn = table === 'profiles' || table === 'households' ? 1 : 0;
      if (rows > allowedOwn) findings.push({ persona: 'outsider', path: `db:${table}`, kind: 'LEAK', detail: `${rows} rows` });
      expect.soft(rows, `outsider can list ${rows} ${table} rows`).toBeLessThanOrEqual(allowedOwn);
    }
    await sb.auth.signOut();
  });

  test('crawl summary', async () => {
    for (const c of ctxs) await c.close();
    const byKind: Record<string, number> = {};
    for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    console.log('[crawl] findings by kind', JSON.stringify(byKind));
    expect.soft(findings.filter((f) => ['LEAK', 'ADMIN-EXPOSED'].includes(f.kind))).toEqual([]);
  });
});

// Parallel-call proof for the registration capacity rules, against the LINKED hosted project (Dev).
// pgTAP runs in one transaction and cannot race itself; this fires separate database sessions at the same moment:
//   1. six staff acceptances for ONE remaining spot -> exactly one wins, five get capacity_full;
//   2. six simultaneous signed-in submissions to a full event with a waitlist -> six distinct waitlist positions, no errors.
// It creates (once) a small fixture team/form/event named "Concurrency fixture" and resets its registrations on every run.
// The form version is immutable by design, so the fixture team and form stay; registrations and outbox rows are removed.
// Usage: node scripts/registration-concurrency.mjs   (needs `pnpm supabase` linked to a NON-production project)
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const tmp = mkdtempSync(join(tmpdir(), 'reg-conc-'));
const U = 'c0ffee00-0000-4000-8000-000000000001',
  T = 'c0ffee00-0000-4000-8000-000000000002';
const F = 'c0ffee00-0000-4000-8000-000000000003',
  FV = 'c0ffee00-0000-4000-8000-000000000004',
  E = 'c0ffee00-0000-4000-8000-000000000005';
const reg = (i) => `c0ffee00-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
let n = 0;

async function sql(text, { expectError = false } = {}) {
  const file = join(tmp, `q${n++}.sql`);
  writeFileSync(file, text);
  const { stdout } = await run(
    'pnpm',
    ['--silent', 'supabase', 'db', 'query', '--remote', '--yes', '--file', file],
    { maxBuffer: 1 << 24 },
  ).catch((e) => ({ stdout: String(e.stdout ?? '') + String(e.stderr ?? '') }));
  const failed = /"_tag":"Error"/.test(stdout);
  if (failed && !expectError) return { ok: false, out: stdout };
  return { ok: !failed, out: stdout };
}
const rows = (out) => {
  const a = out.indexOf('"rows"');
  try {
    return JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows;
  } catch {
    return [];
  }
};
const asAdmin = `perform set_config('request.jwt.claims', '{"sub":"${U}","role":"authenticated"}', true);`;

console.log('setting up fixture...');
const setup = await sql(`
insert into auth.users (id, email) values ('${U}', 'concurrency@concurrency.invalid') on conflict (id) do nothing;
insert into public.teams (id, name, sport, season_label, join_code) values ('${T}', 'Concurrency fixture', 'soccer', 'Test', 'CONCUR0001') on conflict (id) do nothing;
insert into public.team_memberships (team_id, profile_id, role) values ('${T}', '${U}', 'admin') on conflict do nothing;
insert into public.forms (id, team_id, name) values ('${F}', '${T}', 'Concurrency form') on conflict (id) do nothing;
insert into public.form_versions (id, form_id, version, schema) values ('${FV}', '${F}', 1, '{"fields":[]}') on conflict (id) do nothing;
insert into public.registration_events (id, team_id, title, slug, status, capacity, waitlist_enabled, form_version_id, opens_at, closes_at, created_by)
  values ('${E}', '${T}', 'Concurrency fixture event', 'concurrency-fixture-1', 'open', 1, true, '${FV}', now() - interval '1 day', now() + interval '365 days', '${U}') on conflict (id) do nothing;
delete from public.notification_outbox where recipient_email like '%@concurrency.invalid';
delete from public.registrations where registration_event_id = '${E}';
update public.registration_events set capacity = 1, waitlist_enabled = true where id = '${E}';
insert into public.registrations (id, registration_event_id, display_id, submitted_by, guardian_name, guardian_email, guardian_relationship, player_first_name, player_last_name, player_date_of_birth, form_version_id, status)
select ('c0ffee00-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, '${E}', private.next_registration_display_id(), '${U}', 'G', 'g' || g || '@concurrency.invalid', 'Mother', 'Kid' || g, 'Test', date '2016-01-01', '${FV}', 'submitted'
from generate_series(1, 6) g;
`);
if (!setup.ok) {
  console.error('setup failed', setup.out.slice(0, 400));
  process.exit(1);
}

console.log('race 1: six parallel acceptances for one spot...');
const accepts = await Promise.all(
  [1, 2, 3, 4, 5, 6].map((i) =>
    sql(
      `do $$ begin ${asAdmin} perform public.decide_registration('${reg(i)}', 'accept', null); end $$;`,
      { expectError: true },
    ),
  ),
);
const won = accepts.filter((r) => r.ok).length;
const full = accepts.filter((r) => !r.ok && r.out.includes('capacity_full')).length;
const count = rows(
  (
    await sql(
      `select count(*)::int as accepted from public.registrations where registration_event_id = '${E}' and status = 'accepted'`,
    )
  ).out,
)[0]?.accepted;
const r1 = won === 1 && full === 5 && count === 1;
console.log(
  `  succeeded=${won} capacity_full=${full} accepted_in_db=${count} -> ${r1 ? 'PASS' : 'FAIL'}`,
);

console.log('race 2: six parallel signed-in submissions to a full event with a waitlist...');
const subs = await Promise.all(
  [1, 2, 3, 4, 5, 6].map((i) =>
    sql(
      `select status from public.svc_create_registration('${E}', '${FV}', 'G', 'new${i}@concurrency.invalid', null, 'Mother', 'Racer${i}', 'Test', date '2016-02-02', null, '${U}', '{}', '{}')`,
      { expectError: true },
    ),
  ),
);
const errs = subs.filter((r) => !r.ok).length;
const pos = rows(
  (
    await sql(
      `select waitlist_position as p from public.registrations where registration_event_id = '${E}' and player_first_name like 'Racer%' order by 1`,
    )
  ).out,
).map((x) => x.p);
const r2 = errs === 0 && pos.length === 6 && new Set(pos).size === 6;
console.log(
  `  errors=${errs} waitlist_positions=${JSON.stringify(pos)} -> ${r2 ? 'PASS' : 'FAIL'}`,
);

await sql(
  `delete from public.notification_outbox where recipient_email like '%@concurrency.invalid'; delete from public.registrations where registration_event_id = '${E}';`,
);
console.log(r1 && r2 ? 'ALL PASS' : 'FAILED');
process.exit(r1 && r2 ? 0 : 1);

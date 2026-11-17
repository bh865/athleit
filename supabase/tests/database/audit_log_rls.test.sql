-- RLS tests for public.audit_log
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');
insert into public.clubs (id, name, slug) values ('c1000000-0000-0000-0000-000000000001', 'Riverside', 'riverside');
-- Membership writes are audited by trigger.
insert into public.club_memberships (id, club_id, profile_id, role) values
  ('e0000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('e0000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager');
update public.club_memberships set role = 'admin' where id = 'e0000000-0000-0000-0000-00000000000b';
insert into public.audit_log (action, target_type, club_id) values ('other.club', 'clubs', 'c2000000-0000-0000-0000-000000000002');

select is((select count(*)::int from public.audit_log where created_at = now() and club_id = 'c1000000-0000-0000-0000-000000000001'), 3, 'two inserts and one update were audited');
select is((select before ->> 'role' from public.audit_log where created_at = now() and action = 'club_memberships.update'), 'manager', 'update audit stores the before image');
select is((select after ->> 'role' from public.audit_log where created_at = now() and action = 'club_memberships.update'), 'admin', 'update audit stores the after image');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'anonymous users cannot read the audit log');

reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.audit_log), 3, 'club admin reads only their club''s audit rows');
select throws_ok($$ insert into public.audit_log (action, target_type) values ('x', 'y') $$, '42501', null, 'clients cannot write the audit log');
select throws_ok($$ update public.audit_log set action = 'x' $$, '42501', null, 'clients cannot edit the audit log');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'clients cannot delete audit rows');

reset role; select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select 1 from public.audit_log $$, 'a stranger reads no audit rows');
select * from finish();
rollback;

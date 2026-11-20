-- Admin People search, person detail and global lookup: roles, masking, logging, rate limit, restricted money ids.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();
create function pg_temp.login(u uuid, p_aal text default 'aal1') returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true); end $f$;

insert into auth.users (id, email, phone) values
  ('c3000000-0000-0000-0000-000000000001', 'plain@example.test', null),
  ('c3000000-0000-0000-0000-000000000002', 'support2@example.test', null),
  ('c3000000-0000-0000-0000-000000000003', 'admin2@example.test', null),
  ('c3000000-0000-0000-0000-000000000004', 'zelda.findme@example.test', '15551234567');
update public.profiles set display_name = 'Zelda Findme' where id = 'c3000000-0000-0000-0000-000000000004';
insert into public.platform_admins (profile_id, role) values
  ('c3000000-0000-0000-0000-000000000002', 'support'), ('c3000000-0000-0000-0000-000000000003', 'admin');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('c4000000-0000-0000-0000-000000000001', 'Lookup FC', 'soccer', '2026', 'LOOKUPCD01');
insert into public.connected_accounts (team_id, stripe_account_id) values ('c4000000-0000-0000-0000-000000000001', 'acct_lookuptest1');

select pg_temp.login('c3000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.admin_search_people('zelda') $$, '42501', 'not_authorized', 'ordinary user cannot search people');
select throws_ok($$ select public.admin_lookup('acct_lookuptest1') $$, '42501', 'not_authorized', 'ordinary user cannot look up ids');
reset role;

select pg_temp.login('c3000000-0000-0000-0000-000000000002');
select is((public.admin_search_people('zelda') -> 'items' -> 0 ->> 'email'), 'zelda.findme@example.test', 'support finds a person by name and sees the email');
select is((public.admin_search_people('1234567') -> 'items' -> 0 ->> 'phone_masked'), '•••••••4567', 'a phone fragment finds the person; only a masked phone comes back');
select is((public.admin_search_people('zelda.findme@example.test') -> 'items' -> 0 ->> 'name'), 'Zelda Findme', 'search by email');
select throws_ok($$ select public.admin_search_people('ab') $$, '22023', 'query_too_short', 'a 2 character query is refused');
select ok(position('encrypted_password' in (public.admin_get_person('c3000000-0000-0000-0000-000000000004'))::text) = 0, 'person detail never includes password fields');
select is((public.admin_get_person('c3000000-0000-0000-0000-000000000004') -> 'person' ->> 'phone_masked'), '•••••••4567', 'person detail masks the phone');
select is((public.admin_lookup('acct_lookuptest1') ->> 'restricted')::boolean, true, 'support: a Connect account id is restricted');
select is(jsonb_array_length(public.admin_lookup('acct_lookuptest1') -> 'items'), 0, 'support: no money result is returned');
select is((public.admin_lookup('LOOKUPCD01') -> 'items' -> 0 ->> 'label'), 'Lookup FC', 'a team code resolves to the team');
reset role;

select is((select count(*)::int from public.platform_audit_log where action = 'people.search'), 3, 'every search is logged');
select is((select count(*)::int from public.platform_audit_log where action = 'people.search' and after ->> 'q' like '%@%'), 0, 'an email search term is never stored in full');
select is((select count(*)::int from public.platform_audit_log where action = 'people.search' and after ->> 'q' like '%1234567%'), 0, 'a phone search term is never stored in full');
select is((select count(*)::int from public.platform_audit_log where action = 'people.view'), 2, 'person views are logged');

select pg_temp.login('c3000000-0000-0000-0000-000000000003');
select is((public.admin_lookup('acct_lookuptest1') -> 'items' -> 0 ->> 'label'), 'acct_lookuptest1', 'admin: a Connect account id resolves');
select is((public.admin_lookup('acct_lookuptest1') ->> 'restricted')::boolean, false, 'admin: nothing is restricted');
reset role;

-- Rate limit: the 31st search in a minute returns rate_limited instead of raising.
select pg_temp.login('c3000000-0000-0000-0000-000000000003');
do $$ begin for i in 1..30 loop perform public.admin_search_people('zelda'); end loop; end $$;
select is((public.admin_search_people('zelda') ->> 'rate_limited')::boolean, true, 'people search is rate limited');
reset role;

select * from finish();
rollback;

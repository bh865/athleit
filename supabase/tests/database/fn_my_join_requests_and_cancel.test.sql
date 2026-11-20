-- public.get_my_join_requests, public.cancel_join_request, and cancelled requests in get_join_requests
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'coach@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'parent@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coachb@example.test'),
  ('a4444444-4444-4444-4444-444444444444', 'other@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'guardian@example.test');
insert into public.teams (id, name, sport, season_label, join_code) values
  ('a1000000-0000-0000-0000-00000000000a', 'Hawks', 'soccer', 'Fall', 'HAWKS00001'),
  ('a2000000-0000-0000-0000-00000000000b', 'Owls', 'soccer', 'Fall', 'OWLS000002'),
  ('a3000000-0000-0000-0000-00000000000c', 'Wolves', 'soccer', 'Fall', 'WOLVES0003');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'admin'),
  ('a2000000-0000-0000-0000-00000000000b', 'a3333333-3333-3333-3333-333333333333', 'admin');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a2000000-0000-0000-0000-00000000000b', 'a2222222-2222-2222-2222-222222222222', 'parent');
insert into public.households (id, name) values
  ('11000000-0000-0000-0000-000000000001', 'Park family'),
  ('22000000-0000-0000-0000-000000000002', 'Other family');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222'),
  ('22000000-0000-0000-0000-000000000002', 'a5555555-5555-5555-5555-555555555555');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Maya', 'Park', current_date - interval '9 years');
insert into public.join_requests (id, team_id, requester_id, player_id, status) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', '91000000-0000-0000-0000-000000000001', 'pending'),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000b', 'a2222222-2222-2222-2222-222222222222', '91000000-0000-0000-0000-000000000001', 'approved'),
  ('b3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-00000000000c', 'a2222222-2222-2222-2222-222222222222', null, 'declined'),
  ('b4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', null, 'approved');
insert into public.household_join_requests (id, household_id, requester_id, status) values
  ('c1000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222', 'pending'),
  ('c2000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'approved'),
  ('c3000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222', 'approved');

set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.get_my_join_requests() $$, '42501', null, 'anonymous users cannot read own requests');
select throws_ok($$ select public.cancel_join_request('team', 'b1000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous users cannot cancel');

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_my_join_requests()), 7, 'the requester sees all of their own requests, both kinds');
select is((select place_name from public.get_my_join_requests() where request_id = 'b1000000-0000-0000-0000-000000000001'), null, 'a pending team request carries no team name');
select is((select place_name from public.get_my_join_requests() where request_id = 'b3000000-0000-0000-0000-000000000003'), null, 'a declined team request carries no team name');
select is((select place_name from public.get_my_join_requests() where request_id = 'c1000000-0000-0000-0000-000000000001'), null, 'a pending family request carries no family name');
select is((select place_name from public.get_my_join_requests() where request_id = 'b2000000-0000-0000-0000-000000000002'), 'Owls', 'an approved request shows the team name');
select is((select child_first_name from public.get_my_join_requests() where request_id = 'b1000000-0000-0000-0000-000000000001'), 'Maya', 'the child the requester named is shown');
select is((select place_name from public.get_my_join_requests() where request_id = 'c2000000-0000-0000-0000-000000000002'), 'Park family', 'an approved family request names the family while the caller is a guardian');
select is((select place_name from public.get_my_join_requests() where request_id = 'b4000000-0000-0000-0000-000000000004'), null, 'an approved team request no longer names the team once membership has ended');
select is((select place_name from public.get_my_join_requests() where request_id = 'c3000000-0000-0000-0000-000000000003'), null, 'an approved family request no longer names the family once the caller is not a guardian');
select is((select count(*)::int from public.get_my_join_requests() where place_name = 'Hawks'), 0, 'the pending team name never appears anywhere in the result');

reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_my_join_requests() $$, 'another user sees none of them');
select throws_ok($$ select public.cancel_join_request('team', 'b1000000-0000-0000-0000-000000000001') $$, 'P0001', 'request_not_found', 'another user cannot cancel');
select throws_ok($$ select public.cancel_join_request('household', 'c1000000-0000-0000-0000-000000000001') $$, 'P0001', 'request_not_found', 'another user cannot cancel a family request');

reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_my_join_requests() $$, 'staff of another team see none of them');

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select throws_ok($$ select public.cancel_join_request('team', 'b2000000-0000-0000-0000-000000000002') $$, 'P0001', 'request_not_pending', 'an approved request cannot be cancelled');
select throws_ok($$ select public.cancel_join_request('team', 'b3000000-0000-0000-0000-000000000003') $$, 'P0001', 'request_not_pending', 'a declined request cannot be cancelled');
select throws_ok($$ select public.cancel_join_request('nope', 'b1000000-0000-0000-0000-000000000001') $$, 'P0001', 'invalid_target', 'an unknown kind is refused');

reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') where status = 'pending'), 1, 'staff see the pending request before it is cancelled');

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.cancel_join_request('team', 'b1000000-0000-0000-0000-000000000001') $$, 'the requester cancels their pending team request');
select lives_ok($$ select public.cancel_join_request('household', 'c1000000-0000-0000-0000-000000000001') $$, 'the requester cancels their pending family request');
select is((select status from public.get_my_join_requests() where request_id = 'b1000000-0000-0000-0000-000000000001'), 'cancelled', 'the requester sees it as cancelled');
select throws_ok($$ select public.cancel_join_request('team', 'b1000000-0000-0000-0000-000000000001') $$, 'P0001', 'request_not_pending', 'cancelling twice is refused');

reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_join_requests('a1000000-0000-0000-0000-00000000000a') where status in ('pending', 'cancelled') $$, 'a cancelled request disappears from the approver list');
select throws_ok($$ select public.decide_join_request('b1000000-0000-0000-0000-000000000001', true) $$, 'P0001', 'request_not_pending', 'staff cannot approve a cancelled request');
select is((select count(*)::int from public.team_memberships where profile_id = 'a2222222-2222-2222-2222-222222222222'), 0, 'a cancelled request grants nothing');

reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is_empty($$ select * from public.get_household_join_requests('22000000-0000-0000-0000-000000000002') $$, 'a cancelled family request disappears from the guardian list');
select throws_ok($$ select public.decide_household_join_request('c1000000-0000-0000-0000-000000000001', true) $$, 'P0001', 'request_not_pending', 'a guardian cannot approve a cancelled family request');

reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select lives_ok($$ select public.request_to_join('HAWKS00001', null, '91000000-0000-0000-0000-000000000001', null) $$, 'a cancelled request can be sent again');
select is((select count(*)::int from public.get_my_join_requests() where status = 'pending' and kind = 'team'), 1, 'the new request is pending');

select * from finish();
rollback;

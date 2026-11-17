-- Storage policies for the player-photos bucket
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'g1@example.test'), ('a2222222-2222-2222-2222-222222222222', 'g2@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'coach@example.test'), ('a4444444-4444-4444-4444-444444444444', 'coachb@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'teammate.parent@example.test');
insert into public.teams (id, name, sport, season_label) values
  ('a1000000-0000-0000-0000-00000000000a', 'A', 'soccer', 'Fall'), ('a2000000-0000-0000-0000-00000000000b', 'B', 'soccer', 'Fall');
insert into public.team_memberships (team_id, profile_id, role) values
  ('a1000000-0000-0000-0000-00000000000a', 'a3333333-3333-3333-3333-333333333333', 'coach'),
  ('a1000000-0000-0000-0000-00000000000a', 'a5555555-5555-5555-5555-555555555555', 'parent'),
  ('a2000000-0000-0000-0000-00000000000b', 'a4444444-4444-4444-4444-444444444444', 'coach');
insert into public.households (id, name) values ('11000000-0000-0000-0000-000000000001', 'G fam'), ('22000000-0000-0000-0000-000000000002', 'G2 fam');
insert into public.household_members (household_id, profile_id) values
  ('11000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111'),
  ('22000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('91000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Ava', 'Adams', current_date - interval '10 years'),
  ('92000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'Ben', 'Brown', current_date - interval '9 years');
insert into public.team_players (team_id, player_id, jersey_number) values ('a1000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-000000000001', 7);
insert into storage.objects (bucket_id, name, owner_id) values ('player-photos', '91000000-0000-0000-0000-000000000001/photo.jpg', null);

select is((select public from storage.buckets where id = 'player-photos'), false, 'the bucket is private');
select is(private.photo_player_id('not-a-uuid/x.jpg'), null, 'malformed paths map to no player');
set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'anonymous users cannot read photos');
reset role; select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 1, 'a guardian reads their child''s photo');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('player-photos', '91000000-0000-0000-0000-000000000001/new.jpg', null) $$, 'a guardian can upload for their child');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('player-photos', '92000000-0000-0000-0000-000000000002/x.jpg') $$, '42501', null, 'a guardian cannot upload for another family''s child');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('player-photos', 'garbage/x.jpg') $$, '42501', null, 'a malformed path is refused');
reset role; select set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 2, 'staff of the child''s team can read the child''s photos');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('player-photos', '91000000-0000-0000-0000-000000000001/staff.jpg') $$, '42501', null, 'staff cannot upload photos');
reset role; select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'staff of another team cannot read the photo');
reset role; select set_config('request.jwt.claims', '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'a teammate''s parent cannot read the photo');
reset role; select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true); set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'player-photos'), 0, 'another family cannot read the photo');
select is_empty($$ update storage.objects set name = '91000000-0000-0000-0000-000000000001/photo.jpg' where name = '91000000-0000-0000-0000-000000000001/photo.jpg' returning 1 $$, 'another family cannot replace the photo');
select * from finish();
rollback;

-- fn_get_thread_media
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aa000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('aa000000-0000-0000-0000-000000000002', 'coach@example.test'),
  ('aa000000-0000-0000-0000-000000000003', 'mgr@example.test'),
  ('bb000000-0000-0000-0000-000000000001', 'par1@example.test'),
  ('bb000000-0000-0000-0000-000000000002', 'par2@example.test'),
  ('bb000000-0000-0000-0000-000000000003', 'par3@example.test'),
  ('cc000000-0000-0000-0000-000000000001', 'teen@example.test'),
  ('dd000000-0000-0000-0000-000000000001', 'xadmin@example.test'),
  ('dd000000-0000-0000-0000-000000000002', 'xparent@example.test');
insert into public.teams (id, name, sport, season_label) values
  ('e1000000-0000-0000-0000-000000000001', 'T1', 'soccer', 'Fall'),
  ('e2000000-0000-0000-0000-000000000002', 'T2', 'soccer', 'Fall');
insert into public.households (id, name) values
  ('f0000000-0000-0000-0000-000000000001', 'H1'), ('f0000000-0000-0000-0000-000000000002', 'H2');
insert into public.household_members (household_id, profile_id) values
  ('f0000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-000000000002');
insert into public.players (id, household_id, first_name, last_name, date_of_birth, profile_id) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Teen', 'One', current_date - interval '15 years', 'cc000000-0000-0000-0000-000000000001');
insert into public.players (id, household_id, first_name, last_name, date_of_birth) values
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Kid', 'Two', current_date - interval '10 years');
insert into public.team_memberships (team_id, profile_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'admin'),
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', 'coach'),
  ('e1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', 'manager'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000002', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000003', 'parent'),
  ('e1000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'player'),
  ('e2000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001', 'admin'),
  ('e2000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000002', 'parent');
-- Threads: announcement (A), group (G: coach, par1, par3), direct (D: par1 <-> par3)
insert into public.threads (id, team_id, type, title, created_by) values
  ('71000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'announcement', 'News', 'aa000000-0000-0000-0000-000000000001'),
  ('71000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000001', 'group', 'Group', 'aa000000-0000-0000-0000-000000000002'),
  ('71000000-0000-0000-0000-00000000000c', 'e1000000-0000-0000-0000-000000000001', 'direct', null, 'bb000000-0000-0000-0000-000000000001');
insert into public.thread_participants (thread_id, profile_id, role, joined_at) values
  ('71000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002', 'owner', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000001', 'member', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000003', 'member', now() - interval '1 day'),
  ('71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000001', 'owner', now() - interval '10 days'),
  ('71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000003', 'member', now() - interval '10 days');
insert into public.messages (id, thread_id, sender_profile_id, body, created_at) values
  ('81000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002', 'old group msg', now() - interval '5 days'),
  ('81000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000001', 'new group msg', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-00000000000c', 'bb000000-0000-0000-0000-000000000001', 'dm', now() - interval '1 hour'),
  ('81000000-0000-0000-0000-000000000004', '71000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001', 'announce', now());
insert into auth.users (id, email) values ('bb000000-0000-0000-0000-000000000004', 'par4@example.test');
insert into public.team_memberships (team_id, profile_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000004', 'parent');
insert into public.thread_participants (thread_id, profile_id, role, joined_at, left_at) values
  ('71000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-000000000004', 'member', now() - interval '10 days', now() - interval '2 days');


insert into public.message_attachments (id, message_id, storage_path, mime_type, size_bytes) values
  ('91000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-00000000000b/u1/old.png','image/png',10),
  ('91000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-00000000000b/u2/new.pdf','application/pdf',20);
insert into public.messages (id, thread_id, sender_profile_id, body, hidden_by, hidden_at) values
  ('81000000-0000-0000-0000-000000000020','71000000-0000-0000-0000-00000000000b','aa000000-0000-0000-0000-000000000002','', 'aa000000-0000-0000-0000-000000000002', now());
insert into public.message_attachments (message_id, storage_path, mime_type, size_bytes) values
  ('81000000-0000-0000-0000-000000000020','71000000-0000-0000-0000-00000000000b/u3/hidden.png','image/png',30);
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000003","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 1, 'a late joiner sees only attachments from after they joined, never hidden ones');
select is((select original_name from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 'new.pdf', 'the name is the last path segment');
reset role; select set_config('request.jwt.claims', '{"sub":"aa000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 2, 'staff see all history but never a hidden message''s attachment');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 0, 'a non-member gets nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"bb000000-0000-0000-0000-000000000004","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 0, 'a removed member gets nothing');
reset role; select set_config('request.jwt.claims', '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated"}', true); set local role authenticated;

select is((select count(*)::int from public.get_thread_media('71000000-0000-0000-0000-00000000000b')), 0, 'another team gets nothing');

reset role;
select * from finish();
rollback;

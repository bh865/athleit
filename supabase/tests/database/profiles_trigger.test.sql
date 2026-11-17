-- Signup trigger: a profile row appears for every new auth user.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'named@example.test', '{"display_name":"  Casey Coach "}'),
  ('22222222-2222-2222-2222-222222222222', 'jordan.smith@example.test', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'oauth@example.test',
     '{"full_name":"Pat Parent","picture":"https://example.test/p.png"}');

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Casey Coach',
  'display_name metadata is used (trimmed)'
);

select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'jordan.smith',
  'falls back to the email local part'
);

select is(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'Pat Parent',
  'OAuth full_name is used when display_name is absent'
);

select is(
  (select avatar_url from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'https://example.test/p.png',
  'OAuth picture becomes avatar_url'
);

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select is_empty(
  $$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  'deleting the auth user cascades to the profile'
);

select * from finish();
rollback;

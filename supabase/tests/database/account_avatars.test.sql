-- Avatar bucket policies and the profiles.avatar_url shape check.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');

select is((select public from storage.buckets where id = 'avatars'), false, 'the avatars bucket is private');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 5242880::bigint, 'the bucket caps files at 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'avatars'), array['image/jpeg', 'image/png', 'image/webp'], 'only JPEG, PNG and WebP are allowed');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, 'a user can upload into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, '42501', null, 'a user cannot upload into another user''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', 'loose.jpg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$, '42501', null, 'a file outside any user folder is refused');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1, 'the owner can read their own photo');

select lives_ok($$ update public.profiles set avatar_url = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a.jpg' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, 'a user can point their avatar at their own photo');
select lives_ok($$ update public.profiles set avatar_url = 'https://lh3.example.test/p.jpg' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, 'an https picture URL is allowed');
select throws_ok($$ update public.profiles set avatar_url = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a.jpg' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, '23514', null, 'a user cannot point their avatar at another user''s folder');
select throws_ok($$ update public.profiles set avatar_url = 'http://insecure.example.test/p.jpg' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, '23514', null, 'a plain http URL is refused');
select lives_ok($$ update public.profiles set avatar_url = null where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, 'a user can remove their avatar');

-- Another user cannot see, edit or delete it.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'another user cannot read the photo');
select is((with d as (delete from storage.objects where bucket_id = 'avatars' returning 1) select count(*)::int from d), 0, 'another user cannot delete the photo');
select is((with u as (update public.profiles set display_name = 'Hijacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1) select count(*)::int from u), 0, 'another user cannot edit this profile');
select is((select count(*)::int from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0, 'another user cannot read this profile');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anonymous users have no access to profiles');
select * from finish();
rollback;

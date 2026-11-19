-- Account: profile photos. A private Storage bucket, one folder per user (<user id>/<file>).
-- Only the owner can read, write, replace or delete their own folder. Other members never see
-- an avatar today (profiles are readable only by their owner), so no cross-user read policy
-- is added. Clients show the photo through a short-lived signed URL.
--
-- profiles.avatar_url holds either an external https URL (an OAuth provider's picture) or the
-- storage path of an uploaded photo. The check keeps a user from pointing their profile at
-- someone else's folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Avatars: owner reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Avatars: owner uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Avatars: owner replaces"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Avatars: owner deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- NOT VALID: applies to every new write without rescanning rows written before this existed.
alter table public.profiles
  add constraint profiles_avatar_url_shape
  check (
    avatar_url is null
    or (char_length(avatar_url) <= 500
        and (avatar_url ~ '^https://' or avatar_url like id::text || '/%'))
  ) not valid;

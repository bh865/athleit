-- Child photos: a private Storage bucket whose access follows the same membership rules as the
-- player row. Object path: <player_id>/<file>. Guardians upload and replace; anyone who can see
-- the player (guardians, the player, staff of their teams) can read. No table is added.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The player id encoded in the first path segment, or NULL if the path is malformed.
create function private.photo_player_id(p_name text)
returns uuid language sql immutable set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
revoke execute on function private.photo_player_id(text) from public, anon, authenticated;
grant execute on function private.photo_player_id(text) to authenticated;

create policy "Player photos: anyone who can see the player can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and private.can_see_player(private.photo_player_id(name)));

create policy "Player photos: guardians upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and private.is_guardian_of(private.photo_player_id(name)));

create policy "Player photos: guardians replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and private.is_guardian_of(private.photo_player_id(name)))
  with check (bucket_id = 'player-photos' and private.is_guardian_of(private.photo_player_id(name)));

create policy "Player photos: guardians delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and private.is_guardian_of(private.photo_player_id(name)));

-- Messages redesign (3/5): search message bodies across every thread the caller can read.
--
-- Goes through private.can_read_message (join-time rule included), so a parent never matches a
-- message from before they joined, in a thread they left, or in another family's thread.
-- Hidden and deleted messages are excluded; attachment file names are not searched.
-- No extension or index is added: a plain ilike over the readable set is acceptable at current
-- scale (flagged in the PR). Wildcards in the query are escaped; minimum 2 characters; the limit
-- is clamped to 30.

create function public.search_messages(p_query text, p_limit integer default 30)
returns table (
  thread_id uuid, message_id uuid, team_id uuid, team_name text, thread_type text,
  thread_title text, other_name text, snippet text, sender_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_pat text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(v_q) < 2 then return; end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select t.id, m.id, t.team_id, tm.name, t.type, t.title,
         case when t.type = 'direct' then
              (select op.display_name from public.thread_participants tp2
               join public.profiles op on op.id = tp2.profile_id
               where tp2.thread_id = t.id and tp2.left_at is null
                 and tp2.profile_id <> (select auth.uid()) limit 1) end,
         substr(m.body, greatest(1, strpos(lower(m.body), lower(v_q)) - 30), 100),
         sp.display_name, m.created_at
  from public.messages m
  join public.threads t on t.id = m.thread_id
  join public.teams tm on tm.id = t.team_id
  left join public.profiles sp on sp.id = m.sender_profile_id
  where m.body ilike v_pat
    and m.deleted_at is null and m.hidden_at is null
    and private.can_read_message(m.thread_id, m.created_at)
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 30));
end;
$$;

revoke execute on function public.search_messages(text, integer) from public, anon, authenticated;
grant execute on function public.search_messages(text, integer) to authenticated;

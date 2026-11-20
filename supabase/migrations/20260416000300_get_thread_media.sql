-- Messages redesign (4/5): attachments of a thread, for the Info page's Media and Files tabs.
-- Same visibility as search_messages: can_read_message, and never hidden or deleted messages.
-- The original file name is not stored; it is the last segment of the storage path
-- (<thread_id>/<uuid>/<filename>, see uploadAttachment).

create function public.get_thread_media(p_thread_id uuid)
returns table (
  message_id uuid, storage_path text, mime_type text, size_bytes bigint,
  original_name text, sender_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, a.storage_path, a.mime_type, a.size_bytes,
         regexp_replace(a.storage_path, '^.*/', ''), sp.display_name, m.created_at
  from public.messages m
  join public.message_attachments a on a.message_id = m.id
  left join public.profiles sp on sp.id = m.sender_profile_id
  where m.thread_id = p_thread_id
    and m.deleted_at is null and m.hidden_at is null
    and private.can_read_message(m.thread_id, m.created_at)
  order by m.created_at desc, a.created_at desc, a.id;
$$;

revoke execute on function public.get_thread_media(uuid) from public, anon, authenticated;
grant execute on function public.get_thread_media(uuid) to authenticated;

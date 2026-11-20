-- Docs pipeline: the weekly staleness job reports which help articles cover code that changed since they were verified.
-- Called only by the report-docs-status Edge Function (service role, after an HMAC check). Replaces the whole set.
create function public.svc_report_article_status(p_items jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'invalid_items' using errcode = '22023'; end if;
  insert into public.help_article_status (slug, stale, stale_paths, checked_at)
  select i ->> 'slug', coalesce((i ->> 'stale')::boolean, false),
         coalesce((select array_agg(left(p, 300)) from jsonb_array_elements_text(coalesce(i -> 'stale_paths', '[]'::jsonb)) p), '{}'), now()
  from jsonb_array_elements(p_items) i
  where (i ->> 'slug') ~ '^[a-z0-9-]{1,120}$'
  on conflict (slug) do update set stale = excluded.stale, stale_paths = excluded.stale_paths, checked_at = excluded.checked_at;
  get diagnostics v_n = row_count;
  -- Articles that no longer exist are dropped, so the admin page never shows a ghost.
  delete from public.help_article_status where slug not in (select i ->> 'slug' from jsonb_array_elements(p_items) i);
  return v_n;
end;
$$;
revoke execute on function public.svc_report_article_status(jsonb) from public, anon, authenticated;
grant execute on function public.svc_report_article_status(jsonb) to service_role;

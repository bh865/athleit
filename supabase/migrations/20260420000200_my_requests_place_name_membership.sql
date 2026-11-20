-- get_my_join_requests: show a team or family name only while the caller is still a member.
-- An approved request is history; once the person has been removed it must not keep naming the place.
create or replace function public.get_my_join_requests()
returns table (kind text, request_id uuid, status text, created_at timestamptz, decided_at timestamptz,
               child_first_name text, place_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return query
    select * from (
      select 'team'::text as kind, jr.id as request_id, jr.status::text as status, jr.created_at,
             jr.decided_at, p.first_name as child_first_name,
             case when jr.status = 'approved' and private.is_team_member(jr.team_id) then t.name end as place_name
      from public.join_requests jr
      join public.teams t on t.id = jr.team_id
      left join public.players p on p.id = jr.player_id
      where jr.requester_id = auth.uid()
      union all
      select 'household'::text, hr.id, hr.status, hr.created_at, hr.decided_at, null::text,
             case when hr.status = 'approved' and private.is_household_guardian(hr.household_id) then h.name end
      from public.household_join_requests hr
      join public.households h on h.id = hr.household_id
      where hr.requester_id = auth.uid()
    ) r
    order by r.created_at desc, r.request_id
    limit 20;
end;
$$;

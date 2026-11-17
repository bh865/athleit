-- Phase 1A advisor follow-ups: single permissive SELECT policy per table, and no API
-- access to trigger-only SECURITY DEFINER functions.

-- players: can_see_player() already covers guardians, the player themself and roster staff.
drop policy "Guardians and the player themself read the player" on public.players;
drop policy "Roster staff read players" on public.players;
create policy "Family and roster staff read players" on public.players
  for select to authenticated using (private.can_see_player(id));

-- audit_log: club admins and team admins in one policy.
drop policy "Club admins read their club's audit trail" on public.audit_log;
drop policy "Team admins read their team's audit trail" on public.audit_log;
create policy "Club and team admins read their audit trail" on public.audit_log
  for select to authenticated
  using ((club_id is not null and private.is_club_admin(club_id))
         or (team_id is not null and private.has_team_role(team_id, array['admin']::public.team_role[])));

-- Trigger / event-trigger functions are never meant to be called through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

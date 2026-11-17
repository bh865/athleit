# Scheduling, RSVP and game results (Phase 2)

Tables: `sport_configs`, `locations`, `opponents`, `event_series`, `events`, `rsvps`,
`game_results`, `calendar_feed_tokens`. Tests: `supabase/tests/database/` (one file per table and
function). Seeded sport defaults: [sport-configs.md](sport-configs.md). Who can do what:
[permissions.md](permissions.md).

## Principles

- **The database is the authority.** Clients only `select` the scheduling tables (except
  `locations` and `opponents`, which staff manage directly under RLS). Every other write goes
  through a `SECURITY DEFINER` function that checks the caller's role itself and audits. Row-level
  rules (valid timezone, same-team location/opponent, games-only fields, ends after start,
  `revision`, roster membership, result shape) are **triggers**, so they hold for any writer.
- **Access comes from membership, never from the event.** `private.can_view_team_schedule(team)`
  is true for: team staff; a guardian of, or the 13+ login of, an **active** rostered player on the
  team; or an admin of the club the team is linked to (read-only). A parent with a team role but no
  child on the roster does not see the schedule. Nobody reads another team's events; `anon` has
  no grants at all.

## Events

`events` stores `starts_at timestamptz` plus the IANA `timezone` the event happens in. `status` is
`scheduled` or `cancelled` (a cancelled event keeps a `cancelled_reason` and stays visible).
`revision` starts at 1 and the trigger bumps it when **time, end, timezone, location (id or text),
arrive-early or status** changes. Title, notes, opponent and home/away edits do not bump it, so
notifications and calendar `SEQUENCE` only fire for changes attendees care about.

- `create_event(...)`: staff of the team. Single event or recurrence. Returns
  `(event_id, series_id, occurrences)`.
- `update_event(event_id, scope, patch)`: staff. See scopes.
- `cancel_event(event_id, scope, reason)`: staff. A reason is required. Refused while the game has a result.
- `delete_event(event_id)`: staff. **Refused if the event has any RSVP or a result** (`event_has_rsvps`,
  `event_has_result`); cancel instead. FKs also block deleting the row directly. Deleting the last
  occurrence removes the empty series row.

Audit rows written: `event.create`, `event_series.create` (one row per series, not per
occurrence), `event.update` (flags whether time or location changed), `event.cancel`,
`event.delete`, `rsvp.staff_set`, `game_result.record`, `game_result.clear`,
`calendar_feed.create/rotate/revoke` (never containing the token).

## Recurrence (materialized)

`create_event(..., p_recurrence)` takes `{"weekdays": [2,4], "interval": 1, "until": "2027-06-01"}`
or `{"weekdays": [2], "count": 12}` (ISO weekdays, 1 = Monday). It inserts one `event_series` row
(the rule, for reference) and **one `events` row per occurrence** (`series_id` set) in a single
transaction. Nothing evaluates a rule at query time and there is no horizon job: the whole series
is created up front.

- **Cap: 52 occurrences per series and at most 366 days from the start date.** A rule that exceeds
  either is **rejected** (`series_cap_exceeded`), never silently truncated. `interval` is 1 to 4 weeks.
- Occurrences are the dates the rule yields from the start date on. The start date itself is an
  occurrence only if its weekday is listed.
- Every occurrence keeps the same **local wall-clock start** in the event's timezone and a fixed
  **duration**. A 5:30 PM America/New_York practice is 22:30 UTC before the 2027-03-14 change and
  21:30 UTC after, and the pgTAP DST tests (`fn_create_event`) assert exactly this for spring-forward
  and fall-back.

## Edit scopes

`update_event` and `cancel_event` take `scope`:

| Scope                | Rows affected                                                                       |
| -------------------- | ----------------------------------------------------------------------------------- |
| `this`               | just that event                                                                     |
| `this_and_following` | that event and every **scheduled** occurrence of its series starting at or after it |
| `all`                | every **scheduled** occurrence of the series, past and future                       |

A non-series event is always just itself, whatever the scope. Cancelled occurrences are skipped
by `this_and_following` / `all` and cannot be edited (`event_cancelled`).

Patch keys (anything else is rejected): `title`, `notes`, `location_id`, `location_text`,
`opponent_id`, `home_away`, `arrive_early_minutes`, `game_format`, plus time fields:
`starts_at` / `ends_at` / `timezone` (single event only) and `local_start_time` ("HH:MM") /
`duration_minutes` (any scope; applied per occurrence in its own timezone, so DST is preserved).
A JSON `null` clears a nullable field. Setting `location_id` clears `location_text` and vice versa.
Type, team and series membership can never change.

## Time zones

Times are stored as `timestamptz` and shown in the **event's** timezone by default, with the
viewer's local time added when it differs (UI). The timezone must be in `pg_timezone_names`.
Local wall-clock conversion always uses the zone's rules for the occurrence's own date.

## RSVP and privacy

The RSVP belongs to the **player**: unique per `(event_id, player_id)`, and only **active roster**
players of the event's team can have one (trigger).

- `set_rsvp`: a **guardian** of the player (always, and the only way for children under 13) or a
  **13+ player's own login**. The age check is re-done in the function even though the database
  also refuses a login on a child under 13. Refused for cancelled or finished events.
- `staff_set_rsvp`: staff of the event's team, for players on that team. Sets `set_by_staff`,
  records the staff member in `responded_by`, and writes an `rsvp.staff_set` audit row. A later
  guardian response clears `set_by_staff`.
- **Names are staff-only.** `rsvps` rows are readable by team staff, by a guardian for their own
  household's children, and by a 13+ player for themselves. Parents, players and club admins get
  counts only, from `event_rsvp_summary(event_id)`: going, not_going, maybe, and no_reply (active
  rostered players with no row). `event_rsvp_detail(event_id)` (names, notes, who answered) raises
  `forbidden` for anyone who is not staff of the event's team.
- Realtime: `rsvps` and `events` are in the `supabase_realtime` publication, and Realtime applies
  the same RLS (staff receive their team's RSVP changes; a parent receives only their children's).

## Game results

`game_results` (one per game, `event_id` unique) is validated by trigger against the team's
`sport_configs` row: only for `game` events; ties rejected where the sport disallows them;
`period_scores` (array of `{"us": n, "them": n}`) must match the sport's period type. Timed
sports and innings: the periods must add up to the final score; up to 10 extra periods. **Sets
(volleyball):** the score is **sets won**, every set needs a winner, and at most N sets for a
best-of-N. `outcome` (`win` / `loss` / `tie`) is a generated column. `record_game_result` needs
staff, a game that is not cancelled and has **started**; calling it again replaces the result.
`clear_game_result` removes it. `team_record(team_id)` returns wins, losses, ties and games for the
team's `season_label` from resulted, non-cancelled games (a function rather than a view so it needs
no extra grants and works for every viewer).

## Read helpers (UI)

`team_schedule(team, 'upcoming'|'past', limit, offset)` (events with location, opponent, counts and
result; cancelled included), `household_schedule(when, limit, offset)` (one row per child with that
child's RSVP across all their teams), `next_up(limit)` (next scheduled events across the viewer's
teams as staff and as family, with a `children` array of the viewer's own children and statuses).

## Calendar feed tokens

`create_calendar_feed_token()` returns a 64-hex-character token **once**; only its SHA-256 is
stored (`calendar_feed_tokens.token_hash`, a column clients cannot select). One live token per
person; `rotate_calendar_feed_token()` revokes and replaces it; `revoke_calendar_feed_token()`
revokes. `resolve_calendar_feed_token(token)` is executable by `service_role` only (for the feed
Edge Function in Part C): it returns the owner of a live token and records `last_used_at`, and
returns null for unknown, malformed or revoked tokens.

## Deviations from the brief

- `rsvps.team_id` is denormalized (trigger-maintained) so policies and Realtime filters avoid a join.
- `v_team_record` is the function `team_record(team_id)`.
- `event_series` stores the rule; the series template (title, location) lives on the events, so
  edits apply to events, not to the series row.
- A result can only be entered once the game has started.
- Location and opponent deletes use `NO ACTION` foreign keys: an in-use one cannot be deleted
  alone, but deleting a whole team still cascades.

## Screens (web and mobile)

Schedule (week and month on web; Upcoming and Past on mobile), event drawer / page / screen (also the deep-link target
`/events/<id>`), RSVP per child, new / edit / cancel / result flows (edit is web only for now), saved places and opponents
(web), calendar link settings. Realtime: the event view subscribes to `rsvps` and `events` for that event, so staff counts follow
RSVPs live and everyone sees "Updated" when `revision` changes. Date formatting and DST are unit-tested in
`packages/core/src/schedule-time.test.ts`; end-to-end in `apps/web/e2e/scheduling.spec.ts`.
Range helpers added for the calendar views: `team_schedule_range`, `household_schedule_range` (at most 100 days) and `get_event`.

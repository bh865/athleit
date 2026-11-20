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

**Web** (`apps/web/src/components/schedule/`): the Schedule is `Agenda | Week | Month` with a quiet **More** menu
(Places, Opponents, Calendar link). Agenda is the default for families and players, Week for staff. The event opens in
the 400px drawer (`?event=<id>`) or the full page `/events/<id>` (the notification deep link); both render
`EventDetailView`. **Mobile** (`apps/mobile/src/app/(app)/schedule.tsx`, `events/[id].tsx`): `Agenda | Month`, a week
strip, Upcoming | Past, a filter sheet and a More sheet; Edit, Places and Opponents are available on mobile too.
Realtime: the event view subscribes to `rsvps` and `events` for that event, so counts follow RSVPs live.
Date formatting, DST and every view rule are unit-tested in `packages/core/src/schedule-time.test.ts` and
`schedule-view.test.ts`; end-to-end in `apps/web/e2e/scheduling.spec.ts`.
Range helpers: `team_schedule_range`, `household_schedule_range` (at most 100 days) and `get_event`.

### Schedule redesign

- **Shared logic** is `packages/core/src/schedule-view.ts` (web and mobile never disagree): day grouping and
  headings (Today, Tomorrow), range paging (`agendaWindow`, 60 day pages), filters and their URL form, `needsReply`,
  `rowState` (priority **Live now, Cancelled, Needs reply, Updated**; Series and Final are flags), `countsBar`
  (Going, Can't go, Maybe, No reply), week grid layout (`layoutDayBlocks`, overlap columns), `eventStateView`
  (countdown, Live now, Final, Ended; reuses `next-up-state.ts`), `previewRepeat` (the same expansion `create_event`
  runs, with the 52 occurrence and 366 day caps, shown before saving), `revisionNotice`, `nudgeState`.
- **Rows:** families get one "Maya: Going" chip per child with Going and Can't go quick actions while the event is
  open (the same `set_rsvp`); staff and club admins get the counts bar. Names are staff-only and appear only in the
  event's reply panel.
- **Updated per viewer (`event_seen`):** `mark_event_seen(event_id)` records the revision the caller last opened; the
  schedule reads and `get_event` return `seen_revision`. A row shows **Updated** when
  `revision > 1 and revision > coalesce(seen_revision, 0)`. Opening an event calls `mark_event_seen` once. Each person
  reads only their own rows.
- **Previous time or place (`events.last_change`):** `update_event` records `{kind, prev_starts_at, prev_ends_at,
  prev_place, revision, changed_at}` when time or place changes (every affected occurrence for a series scope);
  title and notes edits leave it alone. `get_event` returns it. The notice reads "Time moved from 9:00 AM to 10:00
  AM" or "Place changed from Field 3 to Field 5", with "The time or place changed" when nothing is recorded or it
  belongs to an earlier revision. **Rule:** it shows only while the event has not started and the viewer has not
  opened the current revision; the view keeps the seen revision it opened with, so the notice does not vanish while
  you read it. It holds no names and is not part of the calendar feed.
- **Nudge (`nudge_rsvp_non_responders(event_id)`):** staff of the event's team only, event not cancelled and not over.
  It sends the existing RSVP reminder (same `schedule` category, `reminder` change and copy, through
  `enqueue_notification`, so each person's notification preferences and quiet hours apply) to guardians, and 13+
  players with their own login, of active players with no reply. Returns how many people were notified. One nudge
  per event per 6 hours, enforced by `event_nudges` (one row per event, claimed atomically); a second attempt raises
  `nudged_recently`. The text never contains a child's name or anyone's reply.
- **Delete** is offered to staff and is disabled with "Cancel instead" when replies or a result exist (the database
  refuses it too). Deleting a place or opponent that events use is refused by the foreign key; the UI says so.
- **Differences from the boards:** the web Week grid shows three days below 1100px; the web calendar link has no QR
  code; saved places are a select, not chips; mobile uses a "Show later events" button instead of infinite scroll and
  non-sticky day headings (the shared screen frame owns the scroll view); a mobile week-strip day narrows the agenda
  to that day. Household rows carry no series flag and team rows carry no per-child data, so the series icon and a 13+
  player's own chip appear only where the read provides them.

## Notifications (Part C)

`private.notify_schedule` is called by `create_event`, `update_event`, `cancel_event` and `record_game_result`. It writes
through the Phase 3 `private.enqueue_notification` (category `schedule`), so preferences, quiet hours, device-or-email routing
and delivery are exactly the messaging ones ([notifications.md](notifications.md)).

- **Recipients:** staff of the team, guardians of **active** rostered players, and the login of a rostered 13+ player. Never the
  person who made the change. Club admins, parents of other teams and guardians of inactive players get nothing.
- **What notifies:** a new event; a change to **time or place** (the changes that bump `events.revision`; title, notes, opponent
  and arrive-early edits are silent); a cancellation; a result. A time and place change in one edit is one notification.
- **Batching:** one notification per recipient per call, however many events it touched: "12 practices added", "12 practices
  rescheduled", "10 practices cancelled". Dedupe keys are per change (`sch:<change>:<series or batch>:<profile>`), so a retry is a
  no-op. A result is keyed by its score: saving the same score again is silent, a correction notifies again.
- **Body** is built in the database (`payload.body`, `payload.count`) and never contains a child's name; the push and the alerts
  list show it as is. The deep link is `/events/<first affected event>` on web and mobile.
- **Muted users:** a user with schedule push and email off gets no push or email, but keeps the in-app feed row (the same
  behaviour as messages).
- **RSVP reminders:** pg_cron job `schedule-rsvp-reminders` runs every 15 minutes (`private.send_rsvp_reminders`). A guardian with
  a child who has not answered an event starting within 24 hours gets ONE reminder per event ("RSVP needed: Sat, Nov 21 · 10:00 AM",
  no child name); cancelled and past events are skipped; the dedupe key makes re-runs no-ops.

## Calendar feed

`https://<project>.supabase.co/functions/v1/calendar-feed/<token>.ics` (Edge Function `calendar-feed`, `verify_jwt = false`
because calendar apps cannot send a JWT; the token is the credential).

- The token is 64 hex characters, created by `create_calendar_feed_token()` and shown once; only its SHA-256 is stored.
  `rotate_calendar_feed_token()` and `revoke_calendar_feed_token()` kill the old link at once. Unknown, revoked and malformed
  tokens all return the same 404. The token is never logged (the function logs error codes only).
- Rate limits: 60 requests a minute per IP and 20 per token, per function instance (best effort), with `Retry-After`. Responses
  carry an ETag (304 on `If-None-Match`), `Cache-Control: private, max-age=300` and `Referrer-Policy: no-referrer`.
- Contents: `calendar_feed_events(profile)` (service role only): events from every team the person is on (staff, or guardian of /
  the 13+ login of an actively rostered player), from 30 days back to 365 days ahead, at most 2000. No RSVP data and no player names.
- RFC 5545: CRLF, 75-octet folding, TEXT escaping; `UID:event-<id>@athleit` (stable); `DTSTAMP` and `LAST-MODIFIED` from `updated_at`
  (so the output only changes when an event does); `SEQUENCE` = `revision - 1`; `STATUS:CANCELLED` with the reason in the
  description (cancelled events stay in the feed); `DTSTART;TZID=<event zone>` with a generated `VTIMEZONE` carrying the real
  transitions, so a 5:30 PM practice stays 5:30 PM across DST in the client. Zones the runtime does not know fall back to UTC.
  Occurrences are materialized rows, so there is no `RRULE`.
- Tests: `packages/core/src/ics.test.ts` parses the output back; `calendar-feed.test.ts` covers the handler (404s, ETag, rate
  limits, token never logged); `fn_calendar_feed_events` and `fn_calendar_feed_tokens` cover the database side; the e2e test
  hits the deployed function. Subscribe by pasting the link into Apple Calendar (File > New Calendar Subscription) or Google
  Calendar (Other calendars > From URL).

## Address search (Google Places)

Every place or address a coach types (saved places, an event's "Add a new place…", a registration event's Location) uses
`PlaceAutocomplete` (web: `apps/web/src/components/ui/place-autocomplete.tsx`, mobile: `apps/mobile/src/components/ui/place-autocomplete.tsx`).
Picking a suggestion saves the formatted address, latitude, longitude and Google place id; typing without picking still saves
(the coordinates and place id stay empty, so "Open in Maps" falls back to a text search).

- **Edge Function `places`** (`supabase/functions/places`, logic in `_shared/places/google.ts`) proxies Google Places API (New):
  `autocomplete` (min 3 characters, 120 max, `includedRegionCodes` defaults to `["us"]`, overridable with `countryCodes`) and
  `details`. It needs a signed-in user (`verify_jwt = true`) and is rate limited per user (60 a minute, the shared `api_rate_limits`
  bucket). One session token (UUID v4) covers a typing session: the same token goes on every autocomplete call and the final
  details call, and a new token starts after each pick. Details asks for the single field mask `id,formattedAddress,location,addressComponents`
  (no displayName, photos or reviews), the cheapest Details SKU; the suggested place name is the prediction's main text.
- **Secret:** `GOOGLE_PLACES_API_KEY` is a Supabase Edge Function secret only. It is not in any `.env.example`, any `NEXT_PUBLIC_*` or
  `EXPO_PUBLIC_*` value, or any client bundle. Set it with `pnpm supabase secrets set GOOGLE_PLACES_API_KEY=<key> --project-ref <ref>`
  and deploy with `pnpm supabase functions deploy places`. In Google Cloud enable "Places API (New)", restrict the key to that API,
  and set a daily quota. Without the key the function answers `not_configured` and the forms say search is unavailable; typing still works.
  For local web development, `ALLOWED_ORIGINS` (or `APP_URL`) must list the web origin, like the payment functions.
- **Data stored:** `locations.address`, `lat`, `lng` and the new `place_id` (migration `20260401000000_locations_place_id`), and
  `events.location_text` / registration `location_text` as plain text. Nothing else from Google is stored. The schedule reads
  (`team_schedule`, `household_schedule`, `next_up`, the range reads, `get_event`, `calendar_feed_events`) return `location_lat`,
  `location_lng` and `location_place_id`.
- **Maps links:** `mapsUrl()` in `@athleit/core` builds `https://www.google.com/maps/search/?api=1&query=<address>&query_place_id=<id>`
  (text search when there is no place id) and is used by Home, the event page, both next-up cards and the mobile event screen. The ICS
  feed puts the full address in `LOCATION` and adds `GEO` when coordinates exist.
- **Attribution:** suggestions show "Powered by Google" because they appear without a Google map.
- **Terms to verify (not legal advice):** Google's Places terms limit caching Places content, with `place_id` explicitly allowed to be
  stored; latitude and longitude are only allowed to be cached for a limited time. Persisting the lat/lng of a place the user chose, as
  their own data, is the part to confirm against the current Google Maps Platform Service Specific Terms. The mitigation is that
  `place_id` is the durable key: if coordinates must expire, null `lat`/`lng` (they are optional) and the map link keeps working from
  the place id and address.
- **Not built yet (phase 2):** the public registration `address` field. It is logged-out traffic (abuse and cost) and parents' home
  addresses (see `registration-privacy.md`), so it needs Turnstile or IP rate limiting and a decision on whether typed queries should go
  to Google at all.

# Permissions

Source of truth for who can do what. The database (RLS policies and `SECURITY DEFINER`
functions) enforces everything below; the UI only hides what a user cannot do. Access derives
from rows in `team_memberships`, `club_memberships` and `household_members`, never from a
column on the resource. Tests: `supabase/tests/database/`.

Roles: **Team admin / coach / manager** = _staff_. **Parent** and **Player** are team members
without write access. **Guardian** = member of a household (independent of any team).
**Club admin** = admin of the club a team is affiliated with. "Own" = rows tied to the user.

## Capability matrix

| Resource / action                                        |                                Team admin                                | Coach / manager | Parent |  Player (13+)  | Guardian (household) | Club admin (linked) | Club manager | Anyone else |
| -------------------------------------------------------- | :----------------------------------------------------------------------: | :-------------: | :----: | :------------: | :------------------: | :-----------------: | :----------: | :---------: |
| Read team                                                |                                    ✓                                     |        ✓        |   ✓    |       ✓        |          –           |      ✓ (read)       |      –       |      –      |
| Open the team details area (members, invites, settings…) |                                    ✓                                     |        ✓        |   –    |       –        |          –           |      ✓ (read)       |      –       |      –      |
| Edit team name / sport / season                          |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Set a team's `club_id`                                   |                                    –                                     |        –        |   –    |       –        |          –           |    via approval     |      –       |      –      |
| Request club affiliation                                 |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Approve / decline club link                              |                                    –                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Read full roster (names, DOB, inactive)                  |                                    ✓                                     |        ✓        |   –    |       –        |          –           |      ✓ (read)       |      –       |      –      |
| Read limited roster (first name, #, pos.)                |                                    ✓                                     |        ✓        |   ✓    |       ✓        |          –           |          ✓          |      –       |      –      |
| Edit / deactivate / remove roster rows                   |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Place a child on the roster                              |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Read guardian contacts of rostered child                 |                                    ✓                                     |        ✓        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| Read own child / edit own child's details                |                                    –                                     |        –        |   –    | read self only |          ✓           |          –          |      –       |      –      |
| Add a child (no team needed)                             |             any signed-in user (becomes household guardian)              |                 |        |                |                      |                     |              |
| Read / edit own household                                |                                    –                                     |        –        |   –    |       –        |          ✓           |          –          |      –       |      –      |
| Read team members (names)                                |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Change a member's role / status                          |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Remove a member / leave                                  |                                  ✓ / ✓                                   |      self       |  self  |      self      |          –           |          –          |      –       |      –      |
| Remove or demote the last admin                          |                                  never                                   |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create invite: staff roles (admin/coach/manager)         |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create invite: parent / player roles                     |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create club invite (admin / manager)                     |                                    –                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Read / revoke invites                                    |                                 ✓ (team)                                 |   own created   |   –    |       –        |          –           |      ✓ (club)       | own created  |      –      |
| Accept an invite (holder of the link)                    | any signed-in user with a valid, unexpired, unrevoked, unexhausted token |                 |        |                |                      |                     |              |
| Request to join (team code or id)                        |      any signed-in user; creates a pending request, grants nothing       |                 |        |                |                      |                     |              |
| Read join-request queue / decide                         |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Read own join requests                                   |                                                                          |                 |  own   |      own       |         own          |                     |              |             |
| Claim a player login (13+ only)                          |   any signed-in user; auto-approves only on a confirmed matching email   |                 |        |                |                      |                     |              |
| Approve / decline a player login claim                   |                                    –                                     |        –        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| Read audit trail                                         |                                 ✓ (team)                                 |        –        |   –    |       –        |          –           |      ✓ (club)       |      –       |      –      |
| Invite another guardian into a household                 |                                    –                                     |        –        |   –    |       –        |          ✓           |          –          |      –       |      –      |
| Rotate the team join code                                |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| End a club affiliation (unlink)                          |                                    ✓                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Upload / replace a child's photo                         |                                    –                                     |        –        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| View a child's photo                                     |                               ✓ (rostered)                               |  ✓ (rostered)   |   –    |    own only    |          ✓           |    ✓ (rostered)     |      –       |      –      |
| Create a club / create a team                            |                any signed-in user (creator becomes admin)                |                 |        |                |                      |                     |              |

Messaging and notifications (Phase 3; full rules in [messaging-safety.md](messaging-safety.md)):

| Resource / action                                  |                           Team admin                            | Coach / manager |   Parent    |   Player (13+)    |  Guardian   | Club admin | Club manager | Anyone else |
| -------------------------------------------------- | :-------------------------------------------------------------: | :-------------: | :---------: | :---------------: | :---------: | :--------: | :----------: | :---------: |
| Read announcement threads and messages             |                                ✓                                |        ✓        |      ✓      |         ✓         |      –      |     –      |      –       |      –      |
| Post in announcement threads                       |                                ✓                                |        ✓        |      –      |         –         |      –      |     –      |      –       |      –      |
| Create group / announcement threads                |                                ✓                                |        ✓        |      –      |         –         |      –      |     –      |      –       |      –      |
| Read / post in group threads                       |                    participant (admin: read)                    |   participant   | participant | participant (13+) | participant |     –      |      –       |      –      |
| Direct (1:1) thread                                | any team member, except with a minor who is not their own child |        ↔        |      ↔      | own guardian only |      ↔      |     –      |      –       |      –      |
| Read messages sent before you joined               |                                ✓                                |        ✓        |      –      |         –         |      –      |     –      |      –       |      –      |
| Report a message / react / mute a thread           |                    any reader of the thread                     |                 |             |                   |             |            |              |             |
| Hide a message / review reports                    |                                ✓                                |        ✓        |      –      |         –         |      –      |     –      |      –       |      –      |
| Read the original text of a hidden message         |                                ✓                                |        –        |      –      |         –         |      –      |     –      |      –       |      –      |
| Own notification preferences, devices, in-app feed |                    each user, own rows only                     |                 |             |                   |             |            |              |             |

Scheduling (Phase 2; full rules in [scheduling.md](scheduling.md)). **Family** = a guardian of, or the login of, an
actively rostered player on the team. Club admin = admin of the linked club.

| Resource / action                                  | Team admin | Coach / manager | Parent / guardian (family) | Player (13+) | Club admin (linked) | Anyone else |
| -------------------------------------------------- | :--------: | :-------------: | :------------------------: | :----------: | :-----------------: | :---------: |
| Read the team's events, locations, opponents       |     ✓      |        ✓        |             ✓              |      ✓       |      ✓ (read)       |      –      |
| Create / edit / cancel / delete (no RSVPs) events  |     ✓      |        ✓        |             –              |      –       |          –          |      –      |
| Manage saved locations and opponents               |     ✓      |        ✓        |             –              |      –       |          –          |      –      |
| Read RSVP counts (going / can't go / maybe / none) |     ✓      |        ✓        |             ✓              |      ✓       |          ✓          |      –      |
| Read RSVP names and notes (all players)            |     ✓      |        ✓        |             –              |      –       |          –          |      –      |
| Read the RSVP of their own children / self         |     ✓      |        ✓        |             ✓              |   own only   |          –          |      –      |
| RSVP for a child (a child under 13: guardian only) |     –      |        –        |      ✓ (own children)      |  own (13+)   |          –          |      –      |
| Set an RSVP for a player on their behalf (audited) |     ✓      |        ✓        |             –              |      –       |          –          |      –      |
| Enter / clear a game result                        |     ✓      |        ✓        |             –              |      –       |          –          |      –      |
| Read results and the team record                   |     ✓      |        ✓        |             ✓              |      ✓       |          ✓          |      –      |
| Own calendar feed link (create / rotate / revoke)  |  own only  |    own only     |          own only          |   own only   |      own only       |      –      |

A coach or manager who is also a parent can RSVP for their own child as a guardian. Club admins cannot
edit unless they also hold a team role.

Club members' own rows: club admin reads all memberships in their club and may change roles
or remove members; a club manager reads the club and their own membership. Club admins cannot
edit a linked team unless they also hold a team role.

Payments (Phase 4; model and fee rules in [payments.md](payments.md)). **Issuer** = the issuing team, or the club for club-issued events.
Staff = admin / coach / manager. Club admins act for club-issued events only; they never see a linked team's own payment events.

| Resource / action                                           |                               Issuer admin                                | Coach / manager | Parent / guardian (household) | Player (13+) | Club admin (club-issued) | Anyone else |
| ----------------------------------------------------------- | :-----------------------------------------------------------------------: | :-------------: | :---------------------------: | :----------: | :----------------------: | :---------: |
| Set up / manage the connected account (payouts)             |                                     ✓                                     |        –        |               –               |      –       |         ✓ (club)         |      –      |
| Read the connected account row (requirements)               |                                     ✓                                     |        –        |               –               |      –       |         ✓ (club)         |      –      |
| See account status (ready / needs info)                     |                                     ✓                                     |        ✓        |               –               |      –       |            ✓             |      –      |
| Change the default fee policy                               |                                     ✓                                     |        –        |               –               |      –       |            ✓             |      –      |
| Create / edit draft, publish, remind, waive, record offline |                                     ✓                                     |        ✓        |               –               |      –       |            ✓             |      –      |
| Cancel a published event, refund                            |                                     ✓                                     |        –        |               –               |      –       |            ✓             |      –      |
| See who paid / who hasn't (names)                           |                                     ✓                                     |        ✓        |               –               |      –       |   ✓ (club-issued only)   |      –      |
| See collection totals                                       |                                     ✓                                     |        ✓        |               –               |      –       |   ✓ (club-issued only)   |      –      |
| Read own household's requests, payments, receipts, refunds  |                                     –                                     |        –        |         ✓ (own only)          | own requests |            –             |      –      |
| Pay a request (guardians only by default)                   |                                     –                                     |        –        |               ✓               |      –       |            –             |      –      |
| Edit fee config                                             |              nobody in the apps (service role only, audited)              |
| Write payment tables directly                               | nobody; only `SECURITY DEFINER` functions and service-role Edge Functions |

Functions: `create_payment_event`, `update_payment_event`, `publish_payment_event`, `cancel_payment_event`, `waive_request`, `record_offline_payment`,
`send_payment_reminders`, `payer_checkout_quote`, `event_collection_summary`, `event_collection_detail`, `household_payments`, `household_receipts`,
`connected_account_status`, `set_default_fee_policy`. Helpers: `is_issuer_admin`, `is_issuer_staff`, `is_event_staff`, `is_event_admin`, `is_event_payer`,
`is_payment_staff`, `can_read_payment`. Capabilities in code: `payments.view|manage|refund|setup|pay`.

Registration, forms, waivers and documents (Phase 5; model and rules in [registration.md](registration.md), data handling in
[registration-privacy.md](registration-privacy.md)). **Issuer** = the issuing team, or the club for club-issued events. **Manager** = team admin or
manager, or a club admin (club-issued). **Staff** = manager or coach. Club admins see registrations of **club-issued** events only; for team-issued events
of a linked team they get aggregates (`registration_capacity_summary`) and never rows.

| Resource / action                                                                    |                              Team admin                              |  Manager  |    Coach     |       Parent / guardian (registrant)       |        Club admin         |                       Anonymous                        |
| ------------------------------------------------------------------------------------ | :------------------------------------------------------------------: | :-------: | :----------: | :----------------------------------------: | :-----------------------: | :----------------------------------------------------: |
| Create / edit / publish / close / archive registration events, forms, waivers        |                                  ✓                                   |     ✓     |      –       |                     –                      |         ✓ (club)          |                           –                            |
| Read the event, form and waiver drafts and versions                                  |                                  ✓                                   |     ✓     |      ✓       |             own registration's             |         ✓ (club)          |                           –                            |
| Read the public event page (`get_public_registration`)                               |                                  ✓                                   |     ✓     |      ✓       |                     ✓                      |             ✓             | ✓ (public / link-only events, public-safe fields only) |
| Submit a registration                                                                |                                  –                                   |     –     |      –       |           ✓ (Edge Function only)           |             –             |       ✓ (Edge Function only; verified by email)        |
| Read registrations (list, detail, answers except sensitive)                          |                                  ✓                                   |     ✓     |      ✓       |      own only (never other families)       |      ✓ (club-issued)      |                           –                            |
| Read staff notes on a registration                                                   |                                  ✓                                   |     ✓     |      ✓       |                     –                      |      ✓ (club-issued)      |                           –                            |
| Add a staff note                                                                     |                                  ✓                                   |     ✓     |      ✓       |                     –                      |      ✓ (club-issued)      |                           –                            |
| Accept / waitlist / decline, promote from the waitlist                               |                                  ✓                                   |     ✓     |      –       |                     –                      |      ✓ (club-issued)      |                           –                            |
| Withdraw a registration                                                              |                                  ✓                                   |     ✓     |      –       |          ✓ (own; not once placed)          |      ✓ (club-issued)      |                           –                            |
| Place an accepted player on a roster (`place_registered_player`)                     |                                  ✓                                   |     ✓     | ✓ (own team) |                     –                      |             –             |                           –                            |
| Read **sensitive answers** (medical), audited every time                             |                                  ✓                                   | grantable |  grantable   |              own child's only              |      ✓ (club-issued)      |                           –                            |
| Grant / revoke the sensitive-answers capability                                      |                                  ✓                                   |     –     |      –       |                     –                      |         ✓ (club)          |                           –                            |
| Export registrations (CSV rows), audited; sensitive columns only with the capability |                                  ✓                                   |     ✓     |      ✓       |                     –                      |      ✓ (club-issued)      |                           –                            |
| Capacity aggregates (`registration_capacity_summary`)                                |                                  ✓                                   |     ✓     |      ✓       |                     –                      | ✓ (also for linked teams) |                           –                            |
| Sign a waiver for own registration / own rostered child                              |                                  –                                   |     –     |      –       |                     ✓                      |             –             |       via Edge Function after email verification       |
| Read signed waivers and their PDF copies                                             |                                  ✓                                   |     ✓     |      ✓       |               own signatures               |     ✓ (issuer staff)      |                           –                            |
| Read signer IP and user agent (waiver evidence)                                      |                                  ✓                                   |     –     |      –       |                     –                      |         ✓ (club)          |                           –                            |
| Waiver acceptances: update or delete                                                 | nobody (append-only, enforced by trigger, even for the service role) |           |              |                                            |                           |                                                        |
| Waiver compliance per team (`waiver_compliance`)                                     |                                  ✓                                   |     ✓     |      ✓       |                     –                      |             –             |                           –                            |
| Set which waivers a team requires                                                    |                                  ✓                                   |     ✓     |      –       |                     –                      |             –             |                           –                            |
| Upload, edit, pin, archive documents                                                 |                                  ✓                                   |     ✓     |      –       |                     –                      |         ✓ (club)          |                           –                            |
| Read `team_members` documents / `staff_only` documents                               |                                ✓ / ✓                                 |   ✓ / ✓   |    ✓ / ✓     | ✓ / – (team members and rostered families) |       club members        |                           –                            |
| Read archived documents                                                              |                                  ✓                                   |     ✓     |      –       |                     –                      |         ✓ (club)          |                           –                            |

Functions: `create_form`, `save_form_draft`, `publish_form_version`, `create_waiver`, `save_waiver_draft`, `publish_waiver_version`, `set_team_required_waiver`,
`create_registration_event`, `update_registration_event`, `publish_registration_event`, `close_registration_event`, `archive_registration_event`,
`grant_registration_capability`, `decide_registration`, `withdraw_registration`, `promote_from_waitlist`, `place_registered_player`, `get_registration_detail`,
`get_sensitive_answers`, `list_registrations`, `registration_capacity_summary`, `add_registration_note`, `export_registrations`, `list_my_registrations`,
`list_open_registration_events`, `get_public_registration` (also `anon`), `record_waiver_acceptance`, `waiver_compliance`, `create_document`, `update_document`,
`archive_document`, `list_documents`. Also: `registration_payment_status`, `link_registration_player`, `export_registrant_data`, `erase_registrant_data`.
Service role only (Edge Functions): `svc_create_registration`, `svc_verify_registration`, `svc_record_waiver_acceptance`,
`svc_attach_signed_copy`, `svc_issue_verification_token`, `svc_consume_verification_token`, `svc_issue_sign_token`, `svc_resolve_sign_token`,
`svc_issue_claim_token`, `svc_claim_registration`, `svc_find_pending_registration`, `svc_acceptance_context`, `svc_registration_signing_state`, `svc_record_evidence`, `svc_run_registration_retention`,
`claim_registration_emails`. Helpers: `is_issuer_manager`, `can_read_sensitive`, `can_view_registration`, `is_registration_family`, `is_registration_event_staff`,
`can_read_document`, `can_read_acceptance`, `is_team_family`. Capabilities in code: `registration.view|manage|place|sensitive|register`, `documents.view|manage`.

## Data-minimization rules for minors

- Children under 13 never have a login: `players.profile_id` cannot be set when the player is
  under 13 (database trigger; also checked in `claim_player_login`).
- Parents and players never read teammates' `players` rows. They get `get_team_roster()`:
  first name, jersey number and position of **active** players. No last names, no ids, no DOB.
- Guardian email/phone is returned only by `get_guardian_contacts()`: to the child's own
  guardians, and to staff of a team the child is **actively** rostered on. Never to other
  parents, players, or club admins.
- Staff see a child named on a pending/approved join request to their team (to decide and
  place them), but contacts only after they are on the roster.

## Family code and guardian requests

A household has a 10-character `join_code` (same generator and format as `teams.join_code`), readable only by its
guardians. A code never grants access: `request_to_join_household` queues a row in `household_join_requests`, and an
existing guardian approves it with `decide_household_join_request`, which adds the requester to `household_members`
as a guardian and notifies them. Members cannot be removed in this change.

| Resource / action                                             |      Guardian of the household      |     Requester (pending)     |                Anyone else                |
| ------------------------------------------------------------- | :---------------------------------: | :-------------------------: | :---------------------------------------: |
| Read `households.join_code`, rotate it                        |  ✓ (`rotate_household_join_code`)   |              –              |                     –                     |
| Request to join with a code                                   |        – (already a member)         |              ✓              | ✓ (signed in; 10 attempts per 15 minutes) |
| Read `household_join_requests`                                |        own household's rows         |          own rows           |                     –                     |
| List pending requests (name and message, no email)            |  ✓ (`get_household_join_requests`)  |              –              |                     –                     |
| Approve or decline a request                                  | ✓ (`decide_household_join_request`) | – (cannot decide their own) |                     –                     |
| List guardians (name, relationship, since; no email or phone) |    ✓ (`get_household_guardians`)    |              –              |                     –                     |

Writes to `household_join_requests` are never direct (no insert, update or delete grant). A pending requester sees nothing of
the household, its children or its guardians. `request_to_join_household` returns an outcome (`sent`, `invalid_code`,
`already_member`, `too_many_attempts`) instead of raising so failed guesses still count toward the limit; an unknown and a
rotated code are deliberately indistinguishable. Web and mobile gate the Code tab with `family.manage`.

## Functions (all `SECURITY DEFINER`, pinned `search_path`, audited, `authenticated` only)

`create_club`, `create_team`, `create_invite`, `create_household_invite`, `accept_invite`, `revoke_invite`, `unlink_team_from_club`, `rotate_team_join_code`,
`request_to_join`, `decide_join_request`, `add_child`, `place_player_on_roster`,
`request_club_link`, `decide_club_link`, `find_club`, `claim_player_login`,
`decide_player_login_claim`, `get_team_roster`, `get_team_members`, `get_guardian_contacts`.
Family code: `rotate_household_join_code`, `request_to_join_household`, `decide_household_join_request`, `get_household_join_requests`, `get_household_guardians`.
Messaging: `create_thread`, `add_participant`, `remove_participant`, `set_thread_mute`, `set_thread_archived`, `get_thread_members`, `send_message`, `edit_message`, `delete_message`, `hide_message`, `get_hidden_message`, `report_message`, `review_report`, `mark_thread_read`, `toggle_reaction`; notifications: `register_push_device`, `revoke_push_device`, `mark_notifications_read`.
Scheduling: `create_event`, `update_event`, `cancel_event`, `delete_event`, `set_rsvp`, `staff_set_rsvp`, `event_rsvp_summary`, `event_rsvp_detail`, `record_game_result`, `clear_game_result`, `team_record`, `team_schedule`, `household_schedule`, `next_up`, `create_calendar_feed_token`, `rotate_calendar_feed_token`, `revoke_calendar_feed_token` (`resolve_calendar_feed_token` is service-role only).
UI read helpers (no new tables): `get_join_requests`, `get_link_requests`, `get_player_login_claims`, `preview_invite`.
Policy helpers live in the unexposed `private` schema: `is_team_member`, `has_team_role`,
`is_team_staff`, `can_view_team_roster`, `is_club_admin`, `is_club_member`,
`is_household_guardian`, `is_guardian_of`, `is_player_self`, `can_see_player`, `can_read_thread`, `can_read_message`, `can_post_thread`, `can_see_participants`, `can_see_reads`, `can_use_thread_channel`, `can_view_team_schedule`.

## How the apps use this

The team details area (`/teams/[id]`) is gated by `team.details`; parents and players use Roster, Schedule, Messages and Pay from the main navigation, and keep only the Documents shelf (`/teams/[id]/documents`). Switching the active team does not navigate; a Settings item in the navigation opens the details area for team staff.

### Team details tabs

Eight tabs, in order: Overview, People, Payments, Registrations, Forms, Waivers, Documents, Settings
(`visibleTeamTabs` in `packages/core/src/team-details.ts`; no capability changed). Every control is
shown from a capability, never a role string, and hidden rather than explained:

| Area                                                     | Capability that shows it                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab row (any tab)                                        | `team.details`; Payments needs `payments.view`; Registrations, Forms and Waivers need `registration.view`; Documents needs `documents.view` |
| People · Members (read)                                  | `members.view`; role change and remove need `members.manage` (admin)                                                                        |
| People · Requests                                        | `joinRequests.decide` (admin, manager, coach)                                                                                               |
| People · Invites, copy team code                         | `invites.createFamily`; staff invite roles need `invites.createStaff`; "Generate new code" needs `team.rotateCode` (admin)                  |
| Registrations: New registration and its builder          | `registration.manage` (admin, manager)                                                                                                      |
| Forms tab: New form, form builder, Duplicate, Archive    | `registration.manage`; the tab itself needs `registration.view`                                                                             |
| Waivers: required-waiver toggles, library, New waiver    | `registration.manage`; the compliance list needs only `registration.view`                                                                   |
| Waivers: Send reminder, Remind all missing               | `registration.manage` (admin, manager), enforced by `remind_waiver_signers`; one reminder per player and waiver per 24 hours                |
| Documents: Upload, edit, pin, change visibility, archive | `documents.manage`; everyone else gets the same library read-only                                                                           |
| Settings: edit details, request or leave a club link     | `team.edit` / `team.requestClubLink` / `team.unlinkClub` (admin); others read                                                               |

Overview and the tab-row counts show counts and first names only: never last names, medical answers or
signed waiver text. Old team URLs redirect (`requests`, `invites`, `members` to People, `compliance` to
Waivers, `schedule` to the global Schedule). On mobile the one team screen takes `section` and `view`
params.

`packages/core/src/capabilities.ts` is the code form of the matrix above (`can(context, capability)`),
used to hide controls a user cannot use. It never grants anything: the database decides.
A unit test per role in `packages/core/src/context.test.ts` keeps the two aligned.

Notes on interpretation: a **club manager** only reads the club; a **club admin** reads the linked
team's roster (names, jersey, status) but not guardian contacts and cannot edit; a **player (13+)**
sees the limited roster and only their own player row and photo.

### Home dashboard

Which Home tiles a person sees is `homeTileIds` in `packages/core/src/home-tiles.ts`, a pure function of
`capabilitiesForPlace` (never the active place kind or one role), with a unit test per persona. Home adds
no database functions: it composes existing RPCs and only ever shows counts and first names from them
(waiver compliance, join requests, registrations). It must not render last names, emails, signed waiver text,
medical answers or RSVP names to parents and players.

## Payment plans

| Action                                                                                              | Who                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Choose a plan, pay installments, turn autopay on or off                                             | A guardian of the billed household (not a 13+ player)                                            |
| Read installments                                                                                   | The billed household, and staff of the issuing team or club (`payment_request_installments` RLS) |
| Set plan terms (`set_payment_event_plan`, `set_registration_event_plan`)                            | Issuer staff, while the event is a draft / before registrations exist                            |
| Offline payment, waive an installment or the remaining balance, remind, retry a charge, restructure | Issuer staff (`private.is_issuer_staff`), each audited                                           |
| Refund against a plan request (`prepare_request_refund`)                                            | Issuer admins                                                                                    |
| Saved card ids, autopay consents                                                                    | Service role only (no client access)                                                             |
| Balance flags (`registration_balances`, `team_player_balances`)                                     | Issuer staff / team staff                                                                        |

A club admin sees totals and names for club-issued events only, as before. A household with an active payment plan cannot delete its account.

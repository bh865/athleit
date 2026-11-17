# Permissions

Source of truth for who can do what. The database (RLS policies and `SECURITY DEFINER`
functions) enforces everything below; the UI only hides what a user cannot do. Access derives
from rows in `team_memberships`, `club_memberships` and `household_members`, never from a
column on the resource. Tests: `supabase/tests/database/`.

Roles: **Team admin / coach / manager** = _staff_. **Parent** and **Player** are team members
without write access. **Guardian** = member of a household (independent of any team).
**Club admin** = admin of the club a team is affiliated with. "Own" = rows tied to the user.

## Capability matrix

| Resource / action                                |                                Team admin                                | Coach / manager | Parent |  Player (13+)  | Guardian (household) | Club admin (linked) | Club manager | Anyone else |
| ------------------------------------------------ | :----------------------------------------------------------------------: | :-------------: | :----: | :------------: | :------------------: | :-----------------: | :----------: | :---------: |
| Read team                                        |                                    ✓                                     |        ✓        |   ✓    |       ✓        |          –           |      ✓ (read)       |      –       |      –      |
| Edit team name / sport / season                  |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Set a team's `club_id`                           |                                    –                                     |        –        |   –    |       –        |          –           |    via approval     |      –       |      –      |
| Request club affiliation                         |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Approve / decline club link                      |                                    –                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Read full roster (names, DOB, inactive)          |                                    ✓                                     |        ✓        |   –    |       –        |          –           |      ✓ (read)       |      –       |      –      |
| Read limited roster (first name, #, pos.)        |                                    ✓                                     |        ✓        |   ✓    |       ✓        |          –           |          ✓          |      –       |      –      |
| Edit / deactivate / remove roster rows           |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Place a child on the roster                      |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Read guardian contacts of rostered child         |                                    ✓                                     |        ✓        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| Read own child / edit own child's details        |                                    –                                     |        –        |   –    | read self only |          ✓           |          –          |      –       |      –      |
| Add a child (no team needed)                     |             any signed-in user (becomes household guardian)              |                 |        |                |                      |                     |              |
| Read / edit own household                        |                                    –                                     |        –        |   –    |       –        |          ✓           |          –          |      –       |      –      |
| Read team members (names)                        |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Change a member's role / status                  |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Remove a member / leave                          |                                  ✓ / ✓                                   |      self       |  self  |      self      |          –           |          –          |      –       |      –      |
| Remove or demote the last admin                  |                                  never                                   |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create invite: staff roles (admin/coach/manager) |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create invite: parent / player roles             |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Create club invite (admin / manager)             |                                    –                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Read / revoke invites                            |                                 ✓ (team)                                 |   own created   |   –    |       –        |          –           |      ✓ (club)       | own created  |      –      |
| Accept an invite (holder of the link)            | any signed-in user with a valid, unexpired, unrevoked, unexhausted token |                 |        |                |                      |                     |              |
| Request to join (team code or id)                |      any signed-in user; creates a pending request, grants nothing       |                 |        |                |                      |                     |              |
| Read join-request queue / decide                 |                                    ✓                                     |        ✓        |   –    |       –        |          –           |          –          |      –       |      –      |
| Read own join requests                           |                                                                          |                 |  own   |      own       |         own          |                     |              |             |
| Claim a player login (13+ only)                  |   any signed-in user; auto-approves only on a confirmed matching email   |                 |        |                |                      |                     |              |
| Approve / decline a player login claim           |                                    –                                     |        –        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| Read audit trail                                 |                                 ✓ (team)                                 |        –        |   –    |       –        |          –           |      ✓ (club)       |      –       |      –      |
| Invite another guardian into a household         |                                    –                                     |        –        |   –    |       –        |          ✓           |          –          |      –       |      –      |
| Rotate the team join code                        |                                    ✓                                     |        –        |   –    |       –        |          –           |          –          |      –       |      –      |
| End a club affiliation (unlink)                  |                                    ✓                                     |        –        |   –    |       –        |          –           |          ✓          |      –       |      –      |
| Upload / replace a child's photo                 |                                    –                                     |        –        |   –    |       –        |   ✓ (own children)   |          –          |      –       |      –      |
| View a child's photo                             |                               ✓ (rostered)                               |  ✓ (rostered)   |   –    |    own only    |          ✓           |    ✓ (rostered)     |      –       |      –      |
| Create a club / create a team                    |                any signed-in user (creator becomes admin)                |                 |        |                |                      |                     |              |

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

## Functions (all `SECURITY DEFINER`, pinned `search_path`, audited, `authenticated` only)

`create_club`, `create_team`, `create_invite`, `create_household_invite`, `accept_invite`, `revoke_invite`, `unlink_team_from_club`, `rotate_team_join_code`,
`request_to_join`, `decide_join_request`, `add_child`, `place_player_on_roster`,
`request_club_link`, `decide_club_link`, `find_club`, `claim_player_login`,
`decide_player_login_claim`, `get_team_roster`, `get_team_members`, `get_guardian_contacts`.
Messaging: `create_thread`, `add_participant`, `remove_participant`, `set_thread_mute`, `set_thread_archived`, `get_thread_members`, `send_message`, `edit_message`, `delete_message`, `hide_message`, `get_hidden_message`, `report_message`, `review_report`, `mark_thread_read`, `toggle_reaction`; notifications: `register_push_device`, `revoke_push_device`, `mark_notifications_read`.
Scheduling: `create_event`, `update_event`, `cancel_event`, `delete_event`, `set_rsvp`, `staff_set_rsvp`, `event_rsvp_summary`, `event_rsvp_detail`, `record_game_result`, `clear_game_result`, `team_record`, `team_schedule`, `household_schedule`, `next_up`, `create_calendar_feed_token`, `rotate_calendar_feed_token`, `revoke_calendar_feed_token` (`resolve_calendar_feed_token` is service-role only).
UI read helpers (no new tables): `get_join_requests`, `get_link_requests`, `get_player_login_claims`, `preview_invite`.
Policy helpers live in the unexposed `private` schema: `is_team_member`, `has_team_role`,
`is_team_staff`, `can_view_team_roster`, `is_club_admin`, `is_club_member`,
`is_household_guardian`, `is_guardian_of`, `is_player_self`, `can_see_player`, `can_read_thread`, `can_read_message`, `can_post_thread`, `can_see_participants`, `can_see_reads`, `can_use_thread_channel`, `can_view_team_schedule`.

## How the apps use this

`packages/core/src/capabilities.ts` is the code form of the matrix above (`can(context, capability)`),
used to hide controls a user cannot use. It never grants anything: the database decides.
A unit test per role in `packages/core/src/context.test.ts` keeps the two aligned.

Notes on interpretation: a **club manager** only reads the club; a **club admin** reads the linked
team's roster (names, jersey, status) but not guardian contacts and cannot edit; a **player (13+)**
sees the limited roster and only their own player row and photo.

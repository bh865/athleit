# Messaging safety rules

These rules are enforced in the database (RLS policies and `SECURITY DEFINER` functions). The apps
only hide what a user cannot do. Tests: `supabase/tests/database/` (`fn_create_thread`,
`fn_add_participant`, `fn_remove_participant`, `fn_send_message`, `fn_hide_message`, `messages_rls`, ...).

Definitions: **staff** = active team admin, coach or manager. **Minor** = a player with a login
under 18 (so 13 to 17; children under 13 have no login). **Guardian of a minor** = a member of the
household the minor's player row belongs to.

## Who is in a thread

1. **Announcement threads have no participant list.** The audience is every active member of the
   thread's team, evaluated live. Leaving or being removed from the team ends access immediately.
   A participant row can exist on an announcement only to store a personal mute; it grants nothing.
2. **Group and direct threads** use `thread_participants`. Access also requires the person to still
   be an active team member and not to have left the thread.
3. Team **admins** can read group threads of their team for moderation oversight, whether or not they
   are participants. Nobody can read a direct thread they are not part of, admins included.

## Children and guardians

4. Children under 13 have no login. Their guardians message and receive messages as themselves.
5. A **direct (1:1) thread** that includes a minor is only allowed with that minor's guardian.
   (`direct_minor_guardian_only`). This covers staff to minor, parent to someone else's minor, a
   minor to a non-guardian adult, and minor to minor. Staff reach a player's family by messaging the
   guardian.
6. A **group thread that includes any minor** must have at least two staff adults, or one staff
   adult plus a guardian of a minor in the thread (`minor_group_needs_two_adults`). Checked when the
   thread is created, when a participant is added and when one is removed or leaves, so a removal
   that would break the rule is refused.
7. **Players aged 13 to 17** can read announcement and group threads they belong to and post in group
   threads that staff create. They can open a direct thread only with their own guardian (rule 5),
   cannot create groups or announcements, and cannot add participants.

## Who can create and post

8. Only staff create **group** and **announcement** threads and add or remove group participants
   (the thread's owner, or a team admin). Parents and players can open direct threads only (rule 5
   still applies). A pair of people reuses their existing direct thread.
9. Only staff can **post in announcement threads**; everyone else on the team reads them (and can
   react, report and mute). In group and direct threads `owner` and `member` participants post;
   `read_only` participants do not. Archived threads accept no new messages.
10. A **rate limit** of 30 messages per user per rolling minute is enforced in `send_message`
    (`rate_limited`). Bodies are at most 4000 characters. Attachments: up to 5 per message, images
    (JPEG, PNG, WebP, GIF) and PDFs, up to 10 MB each, in a private bucket whose access follows thread
    access (read: anyone who can read the thread; upload: anyone who can post in it; no client update
    or delete).

## History and visibility

11. **Join-time visibility.** Non-staff only see messages created at or after the time they joined the
    thread (for announcements: when they first became an active team member; re-adding a participant
    resets their join time). Staff of the team see the full history of every thread they can read.

## Moderation

12. **Any reader can report** a message (not their own; one report per person per message). Staff of the
    team read the report queue and mark reports `actioned` or `dismissed` (audited).
13. **Staff can hide a message.** Hiding empties the message body for everyone, records who hid it and
    when, and writes an audit entry holding the original text and the reason. Participants see the
    message as removed by staff and its attachments disappear; only **team admins** can read the
    original (`get_hidden_message`, backed by the audit trail) and see the attachments.
14. **Deleting your own message** is a soft delete with the same treatment (body emptied, original kept
    in the audit trail for team admins).
15. **Audited actions:** thread creation, participant add and remove, archive, hide, own-message delete,
    report review.

## Notifications

16. Notifications are created by a database trigger for every recipient except the sender, skipping
    muted threads, applying each person's per-channel and per-category preferences, and deferring
    (not dropping) delivery during their quiet hours. Bursts in a thread collapse within 30 seconds.
17. Notifications for a thread that includes a minor never carry message text. Elsewhere a preview is
    included only if the recipient turned previews on (off by default); the in-app feed never stores one.
18. Email is the fallback only when the recipient has no active push device.

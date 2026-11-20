import type { HouseholdScheduleRow, TeamScheduleRow } from '@athleit/db/scheduling';
import type { EventType, RsvpStatus, ScheduleItemLike } from '@athleit/core';

/** One event as the schedule lists show it, whether it came from a team or a household query. */
export interface ScheduleItem extends ScheduleItemLike {
  location: string | null;
  opponent?: string | null | undefined;
  home_away?: string | null | undefined;
  children?: { player_id: string; first_name: string; status: RsvpStatus | null }[] | undefined;
}

export function fromTeamRows(rows: readonly TeamScheduleRow[]): ScheduleItem[] {
  return rows.map((r) => ({
    id: r.id,
    team_id: r.team_id,
    type: r.type as EventType,
    title: r.title,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    timezone: r.timezone,
    location: r.location_name ?? r.location_text ?? null,
    status: r.status as ScheduleItem['status'],
    cancelled_reason: r.cancelled_reason,
    series_id: r.series_id,
    revision: r.revision,
    seen_revision: r.seen_revision,
    opponent: r.opponent_name,
    home_away: r.home_away,
    counts: { going: r.going, not_going: r.not_going, maybe: r.maybe, no_reply: r.no_reply },
    result:
      r.outcome != null
        ? { our: r.our_score, their: r.their_score, outcome: r.outcome }
        : undefined,
  }));
}

/** Household rows are one per child per event; fold them into one item per event. */
export function fromHouseholdRows(rows: readonly HouseholdScheduleRow[]): ScheduleItem[] {
  const byEvent = new Map<string, ScheduleItem>();
  for (const r of rows) {
    let item = byEvent.get(r.event_id);
    if (!item) {
      item = {
        id: r.event_id,
        team_id: r.team_id,
        team_name: r.team_name,
        type: r.type as EventType,
        title: r.title,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        timezone: r.timezone,
        location: r.location_name ?? r.location_text ?? null,
        status: r.status as ScheduleItem['status'],
        cancelled_reason: r.cancelled_reason,
        revision: r.revision,
        seen_revision: r.seen_revision,
        opponent: r.opponent_name,
        home_away: r.home_away,
        children: [],
        result:
          r.outcome != null
            ? { our: r.our_score, their: r.their_score, outcome: r.outcome }
            : undefined,
      };
      byEvent.set(r.event_id, item);
    }
    item.children!.push({
      player_id: r.player_id,
      first_name: r.player_first_name,
      status: (r.rsvp_status as RsvpStatus | null) ?? null,
    });
  }
  return [...byEvent.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

import type { HouseholdScheduleRow, TeamScheduleRow } from '@athleit/db/scheduling';
import type { EventType, RsvpStatus } from '@athleit/core';

/** One event as the schedule lists show it, whether it came from a team or a household query. */
export interface ScheduleItem {
  id: string;
  team_id: string;
  team_name?: string | undefined;
  type: EventType;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string | null;
  status: 'scheduled' | 'cancelled';
  cancelled_reason: string | null;
  counts?: { going: number; not_going: number; maybe: number; no_reply: number } | undefined;
  children?: { player_id: string; first_name: string; status: RsvpStatus | null }[] | undefined;
  result?: { our: number; their: number; outcome: string } | undefined;
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

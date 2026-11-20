import { ageOn, readyChildren, type ReadyChild, type RosterRowLike } from '@athleit/core';
import { getJoinRequests, getPlayersFacts, getRoster } from '@athleit/db/api';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from '../team/team-context';

export type RosterRow = RosterRowLike;
export type { ReadyChild };

export interface PlayerFacts {
  dateOfBirth: string;
  age: number;
  photoPath: string | null;
}

/**
 * Everything the roster screen reads, each in one request: the roster, approved join requests (only
 * with roster.place) and, for full viewers, date of birth and photo path for all roster players in a
 * single batched read. Parents and players never read player rows.
 */
export function useRosterData() {
  const { team, caps } = useTeam();
  const full = caps.has('roster.viewFull');
  const roster = useLoad(() => getRoster(supabase, team.id), [team.id]);
  const requests = useLoad(
    () =>
      caps.has('roster.place')
        ? getJoinRequests(supabase, team.id)
        : Promise.resolve({ data: [], error: null }),
    [team.id],
  );
  const rows = useMemo(() => (roster.data ?? []) as RosterRow[], [roster.data]);
  const idsKey = full
    ? rows
        .map((r) => r.player_id)
        .filter((id): id is string => !!id)
        .sort()
        .join(',')
    : '';
  const factsRes = useLoad(
    () =>
      idsKey
        ? getPlayersFacts(supabase, idsKey.split(','))
        : Promise.resolve({ data: [], error: null }),
    [idsKey],
  );
  const facts = useMemo(() => {
    const m = new Map<string, PlayerFacts>();
    const today = new Date();
    for (const p of factsRes.data ?? [])
      m.set(p.id, {
        dateOfBirth: p.date_of_birth,
        age: ageOn(p.date_of_birth, today),
        photoPath: p.photo_path,
      });
    return m;
  }, [factsRes.data]);
  const ready = useMemo(() => readyChildren(requests.data ?? [], rows), [requests.data, rows]);
  const reloadAll = () => {
    roster.reload();
    requests.reload();
  };
  return { team, caps, rows, ready, facts, roster, reloadAll };
}

'use client';

import { ageOn, type RosterRowLike } from '@athleit/core';
import { getJoinRequests, getPlayersFacts, getRoster } from '@athleit/db/api';
import { useMemo } from 'react';

import { useTeam } from '@/components/app/team-context';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export type RosterRow = RosterRowLike;

export interface ReadyChild {
  playerId: string;
  name: string;
  firstName: string;
}

export interface PlayerFacts {
  dateOfBirth: string;
  age: number;
  photoPath: string | null;
}

/**
 * Everything the roster page reads, each in one request: the roster (`get_team_roster`), approved join
 * requests (only with roster.place) and, for full viewers, date of birth and photo path for all roster
 * players in one batched read. Parents and players never read player rows.
 */
export function useRosterData() {
  const { team, caps } = useTeam();
  const client = getClient();
  const full = caps.has('roster.viewFull');
  const roster = useLoad(() => getRoster(client, team.id), [team.id]);
  const requests = useLoad(
    () =>
      caps.has('roster.place')
        ? getJoinRequests(client, team.id)
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
        ? getPlayersFacts(client, idsKey.split(','))
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

  const ready = useMemo<ReadyChild[]>(() => {
    const onRoster = new Set(rows.map((r) => r.player_id));
    return (requests.data ?? [])
      .filter((r) => r.status === 'approved' && r.player_id && !onRoster.has(r.player_id))
      .map((r) => ({
        playerId: r.player_id as string,
        firstName: r.player_first_name ?? '',
        name: `${r.player_first_name ?? ''} ${r.player_last_name ?? ''}`.trim(),
      }));
  }, [requests.data, rows]);

  const reloadAll = () => {
    roster.reload();
    requests.reload();
  };

  return { team, caps, rows, ready, facts, roster, requests, reloadAll };
}

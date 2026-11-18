import { CLUB_ADMIN_TEAM_VIEW, capabilitiesForPlace, type Capability } from '@athleit/core';
import type { Tables } from '@athleit/db';
import { getTeam } from '@athleit/db/api';
import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';

import { LoadState } from '@/components/app/kit';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

interface TeamState {
  team: Tables<'teams'>;
  caps: ReadonlySet<Capability>;
  reload: () => void;
}
const Ctx = createContext<TeamState | null>(null);

/** Loads one team and works out what the signed-in user may do on it (docs/permissions.md). */
export function TeamProvider({ teamId, children }: { teamId: string; children: ReactNode }) {
  const { contexts, active, setActive } = useApp();
  const res = useLoad(() => getTeam(supabase, teamId), [teamId]);

  // Deep link into a team: make it the active place so the header and Messages/Pay match the page.
  const own = contexts.find((c) => c.kind === 'team' && c.id === teamId);
  useEffect(() => {
    if (own && active?.key !== own.key) setActive(own.key);
  }, [own, active?.key, setActive]);

  const caps = useMemo(() => {
    const own = capabilitiesForPlace(contexts, 'team', teamId);
    if (own.size > 0) return own;
    const clubId = res.data?.club_id;
    const isClubAdmin = contexts.some(
      (c) => c.kind === 'club' && c.id === clubId && c.roles.includes('admin'),
    );
    return isClubAdmin ? CLUB_ADMIN_TEAM_VIEW : new Set<Capability>();
  }, [contexts, teamId, res.data?.club_id]);

  return (
    <LoadState
      loading={res.loading}
      error={
        res.error
          ? 'We couldn’t open this team. It may not exist, or you may not have access.'
          : null
      }
      onRetry={res.reload}
    >
      {res.data && <Ctx value={{ team: res.data, caps, reload: res.reload }}>{children}</Ctx>}
    </LoadState>
  );
}

export function useTeam() {
  const v = use(Ctx);
  if (!v) throw new Error('useTeam must be used inside <TeamProvider>');
  return v;
}

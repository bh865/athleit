'use client';

import { getRoster } from '@athleit/db/api';
import Link from 'next/link';

import { useTeam } from '@/components/app/team-context';
import { LoadState } from '@/components/app/states';
import { Avatar, ButtonLink, Card, Icon, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

/** Team overview: a summary with a link to the Roster page (the roster itself lives at /roster). */
export default function TeamOverviewPage() {
  const { team, caps } = useTeam();
  const roster = useLoad(() => getRoster(getClient(), team.id), [team.id]);
  const rows = roster.data ?? [];
  return (
    <LoadState loading={roster.loading} error={roster.error} onRetry={roster.reload}>
      <Card>
        <Text variant="heading" as="h2">
          Roster
        </Text>
        <Text muted as="p" data-testid="team-roster-count">
          {rows.length} {rows.length === 1 ? 'player' : 'players'} on the active roster
        </Text>
        <ul
          aria-label="Players"
          style={{ display: 'flex', gap: 'var(--space-2)', padding: 0, listStyle: 'none' }}
        >
          {rows.slice(0, 6).map((r) => (
            <li key={r.first_name + String(r.jersey_number)}>
              <Avatar name={r.first_name} size="sm" />
            </li>
          ))}
        </ul>
        {caps.has('roster.viewLimited') ? (
          <ButtonLink href="/roster" data-testid="open-roster">
            Open roster <Icon name="arrow-right" size="sm" />
          </ButtonLink>
        ) : null}
        {caps.has('roster.place') ? (
          <Text muted as="p">
            To place an approved child on the roster, open the roster.{' '}
            <Link href={`/teams/${team.id}/requests`}>Review requests</Link>
          </Text>
        ) : null}
      </Card>
    </LoadState>
  );
}

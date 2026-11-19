'use client';

import { teamTabHref } from '@athleit/core';
import { getRoster } from '@athleit/db/api';

import { useTeam } from '@/components/app/team-context';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  ListGroup,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { AttentionRow, ListState, RowsSkeleton, SectionHead } from './parts';
import { HeaderAction, useTeamHub } from './team-hub';
import styles from './team.module.css';

/** Copies text, with a toast either way. Returns a handler so it can sit on a button. */
export function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast(`Could not copy ${what.toLowerCase()}. Select it and copy by hand.`, 'danger');
    }
  };
}

/** Team code card: shown on Overview and on People · Invites. Copy for every staff role. */
export function TeamCode({ code, children }: { code: string; children?: React.ReactNode }) {
  const copy = useCopy();
  return (
    <div className={styles.stack}>
      <div className={styles.codeRow}>
        <span className={styles.code} data-testid="join-code">
          {code}
        </span>
        <Button variant="secondary" onClick={() => void copy(code, 'Team code')}>
          <Icon name="copy" size="sm" /> Copy
        </Button>
        {children}
      </div>
    </div>
  );
}

/** Overview: "Needs attention" hub, quick actions and a roster snapshot. */
export function TeamOverview() {
  const { team, caps } = useTeam();
  const hub = useTeamHub();
  const copy = useCopy();
  const roster = useLoad(() => getRoster(getClient(), team.id), [team.id]);
  const rows = roster.data ?? [];
  const canInvite = caps.has('invites.createFamily');

  return (
    <div className={styles.stack}>
      {canInvite ? (
        <HeaderAction>
          <ButtonLink href={teamTabHref(team.id, 'people', 'invites')}>
            <Icon name="user-plus" size="sm" /> Invite people
          </ButtonLink>
        </HeaderAction>
      ) : null}

      <Card className={styles.stack}>
        {hub.loading ? (
          <RowsSkeleton label="Loading what needs attention" />
        ) : hub.error ? (
          <ErrorState
            message="Can’t load what needs attention. Check your connection and try again."
            onRetry={hub.reload}
          />
        ) : hub.rows.length === 0 ? (
          <EmptyState
            icon="check"
            title="All caught up"
            body="No requests, waivers, registrations or payments need you right now."
            action={
              canInvite ? (
                <ButtonLink href={teamTabHref(team.id, 'people', 'invites')}>
                  <Icon name="user-plus" size="sm" /> Invite people
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <>
            <SectionHead
              title="Needs attention"
              action={
                <span className={styles.muted}>
                  {hub.rows.length} {hub.rows.length === 1 ? 'item' : 'items'}
                </span>
              }
            />
            <ListGroup data-testid="team-attention">
              {hub.rows.map((r) => (
                <li key={r.kind}>
                  <AttentionRow row={r} teamId={team.id} />
                </li>
              ))}
            </ListGroup>
          </>
        )}
      </Card>

      <div className={styles.cols}>
        <Card className={styles.stack}>
          <h2 className={styles.section}>Quick actions</h2>
          <div className={styles.row}>
            {canInvite ? (
              <ButtonLink variant="secondary" href={teamTabHref(team.id, 'people', 'invites')}>
                <Icon name="user-plus" size="sm" /> Invite people
              </ButtonLink>
            ) : null}
            <Button variant="secondary" onClick={() => void copy(team.join_code, 'Team code')}>
              <Icon name="share-network" size="sm" /> Share team code
            </Button>
          </div>
          <span className={styles.muted}>Team code</span>
          <TeamCode code={team.join_code} />
        </Card>

        <Card className={styles.stack}>
          <h2 className={styles.section}>Roster</h2>
          <ListState
            name="the roster"
            loading={roster.loading}
            error={roster.error}
            onRetry={roster.reload}
            empty={{ when: false, icon: 'users-three', text: '' }}
          >
            <p className={styles.muted} data-testid="team-roster-count">
              <span className={styles.big}>{rows.length}</span>{' '}
              {rows.length === 1 ? 'player' : 'players'} on the active roster
            </p>
            <ul aria-label="Players" className={styles.avatars}>
              {rows.slice(0, 6).map((r) => (
                <li key={`${r.first_name}-${r.jersey_number}`}>
                  <Avatar name={r.first_name} size="sm" />
                </li>
              ))}
            </ul>
          </ListState>
          {caps.has('roster.viewLimited') ? (
            <div>
              <ButtonLink variant="secondary" href="/roster" data-testid="open-roster">
                Open Roster <Icon name="arrow-right" size="sm" />
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

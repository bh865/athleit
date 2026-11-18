'use client';

import { capabilitiesForPlace, friendlyError } from '@athleit/core';
import {
  decideClubLink,
  getClub,
  getClubTeams,
  getLinkRequests,
  unlinkTeamFromClub,
} from '@athleit/db/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { InvitePanel } from '@/components/app/invite-panel';
import { FormMessage, LoadState } from '@/components/app/states';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function ClubPage() {
  const { id } = useParams<{ id: string }>();
  const { contexts } = useApp();
  const client = getClient();
  const caps = capabilitiesForPlace(contexts, 'club', id);
  const admin = caps.has('club.decideLink');
  const club = useLoad(() => getClub(client, id), [id]);
  const teams = useLoad(() => getClubTeams(client, id), [id]);
  const links = useLoad(
    () =>
      admin ? getLinkRequests(client, { clubId: id }) : Promise.resolve({ data: [], error: null }),
    [id],
  );
  const [error, setError] = useState<string | null>(null);

  async function decide(requestId: string, approve: boolean) {
    setError(null);
    const res = await decideClubLink(client, requestId, approve);
    if (res.error) setError(friendlyError(res.error));
    links.reload();
    teams.reload();
  }
  async function unlink(teamId: string) {
    setError(null);
    const res = await unlinkTeamFromClub(client, teamId);
    if (res.error) setError(friendlyError(res.error));
    teams.reload();
  }

  const pending = (links.data ?? []).filter((l) => l.status === 'pending');

  return (
    <>
      <PageHeader title={club.data?.name ?? 'Club'} subtitle={club.data?.slug} />
      <LoadState
        loading={club.loading}
        error={club.error ? 'We couldn’t open this club.' : null}
        onRetry={club.reload}
      >
        {club.data && (
          <>
            <FormMessage error={error} />

            {admin && (
              <section className={styles.stack} aria-labelledby="links-h">
                <h2 className={styles.section} id="links-h">
                  Team requests
                </h2>
                <LoadState
                  loading={links.loading}
                  error={links.error}
                  empty={pending.length === 0}
                  emptyText="No teams are waiting for approval."
                  onRetry={links.reload}
                >
                  <ul className={styles.list} data-testid="link-requests">
                    {pending.map((l) => (
                      <li key={l.id} className={styles.item}>
                        <div className={styles.grow}>
                          <strong>{l.team_name}</strong>
                          <p className={styles.muted}>
                            {l.sport} · {l.season_label} · asked by {l.requested_by_name}
                          </p>
                        </div>
                        <Button onClick={() => void decide(l.id, true)}>Approve</Button>
                        <Button variant="secondary" onClick={() => void decide(l.id, false)}>
                          Decline
                        </Button>
                      </li>
                    ))}
                  </ul>
                </LoadState>
              </section>
            )}

            {caps.has('payments.view') ? (
              <p>
                <Link href={`/clubs/${id}/payments`} className={styles.link}>
                  Club payments
                </Link>
              </p>
            ) : null}

            <section className={styles.stack} aria-labelledby="teams-h">
              <h2 className={styles.section} id="teams-h">
                Teams
              </h2>
              <LoadState
                loading={teams.loading}
                error={teams.error}
                empty={teams.data?.length === 0}
                emptyText="No teams yet. Teams ask to join from their settings, using this club’s web address."
                onRetry={teams.reload}
              >
                <ul className={styles.list}>
                  {teams.data?.map((t) => (
                    <li key={t.id} className={styles.item}>
                      <Link href={`/teams/${t.id}`} className={`${styles.grow} ${styles.link}`}>
                        {t.name}
                      </Link>
                      <Badge>{t.sport}</Badge>
                      <span className={styles.muted}>{t.season_label}</span>
                      {caps.has('club.unlinkTeam') && (
                        <Button
                          variant="ghost"
                          onClick={() => void unlink(t.id)}
                          aria-label={`Unlink ${t.name}`}
                        >
                          Unlink
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </LoadState>
            </section>

            {caps.has('club.invite') && (
              <Card className={styles.stack}>
                <h2 className={styles.section}>Invite club staff</h2>
                <InvitePanel
                  target={{ clubId: id }}
                  roles={[
                    { value: 'manager', label: 'Manager' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}

'use client';

import { friendlyError } from '@athleit/core';
import { decideJoinRequest, getJoinRequests } from '@athleit/db/api';
import { useState } from 'react';

import styles from '@/components/app/app.module.css';
import { FormMessage, LoadState } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import { Badge, Button } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function RequestsPage() {
  const { team, caps } = useTeam();
  const client = getClient();
  const list = useLoad(() => getJoinRequests(client, team.id), [team.id]);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setError(null);
    const res = await decideJoinRequest(client, id, approve);
    if (res.error) setError(friendlyError(res.error));
    list.reload();
  }

  if (!caps.has('joinRequests.decide'))
    return <p className={styles.notice}>Only team staff can see join requests.</p>;

  return (
    <section className={styles.stack}>
      <h2 className={styles.section}>Join requests</h2>
      <p className={styles.muted}>
        Anyone with your team code can ask to join. They get access only after you approve.
      </p>
      <FormMessage error={error} />
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        emptyText="No requests yet. Share your team code or an invite link."
        onRetry={list.reload}
      >
        <ul className={styles.list} data-testid="join-requests">
          {list.data?.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.grow}>
                <strong>{r.requester_name}</strong>
                <p className={styles.muted}>
                  {r.player_first_name
                    ? `For ${r.player_first_name} ${r.player_last_name}`
                    : 'Parent or guardian'}
                  {r.message ? ` · “${r.message}”` : ''}
                </p>
              </div>
              {r.status === 'pending' ? (
                <>
                  <Button onClick={() => void decide(r.id, true)}>Approve</Button>
                  <Button variant="secondary" onClick={() => void decide(r.id, false)}>
                    Decline
                  </Button>
                </>
              ) : (
                <Badge tone={r.status === 'approved' ? 'success' : 'neutral'}>{r.status}</Badge>
              )}
            </li>
          ))}
        </ul>
      </LoadState>
    </section>
  );
}

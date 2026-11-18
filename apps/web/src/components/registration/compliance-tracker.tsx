'use client';

import { friendlyError } from '@athleit/core';
import { getWaiverCompliance, listWaivers, setTeamRequiredWaiver } from '@athleit/db/registration';
import { useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import { Badge, Card, Heading, Select, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';

const TONE = { signed: 'success', missing: 'danger', expired: 'warning' } as const;
const LABEL = { signed: 'Signed', missing: 'Missing', expired: 'Expired' } as const;

/** Who has signed what for a team. Only counts and names: no signed text, no medical answers. */
export function ComplianceTracker({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const client = getClient();
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState('problems');
  const [error, setError] = useState<string | null>(null);
  const rows = useLoad(() => getWaiverCompliance(client, teamId), [teamId, tick]);
  const required = useLoad(async () => {
    const { data, error } = await client
      .from('team_required_waivers')
      .select('waiver_id')
      .eq('team_id', teamId);
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data ?? []).map((r) => r.waiver_id), error: null };
  }, [teamId, tick]);
  const waivers = useLoad(() => listWaivers(client, { teamId }), [teamId, tick]);

  const data = rows.data ?? [];
  const shown = data.filter((r) =>
    filter === 'all' ? true : filter === 'problems' ? r.status !== 'signed' : r.status === filter,
  );
  const counts = { signed: 0, missing: 0, expired: 0 } as Record<string, number>;
  for (const r of data) counts[r.status] = (counts[r.status] ?? 0) + 1;

  async function toggle(waiverId: string, on: boolean) {
    setError(null);
    const r = await setTeamRequiredWaiver(client, teamId, waiverId, on);
    if (r.error) setError(friendlyError(r.error));
    setTick((n) => n + 1);
  }

  return (
    <div className={styles.stack}>
      <Heading as="h2">Waiver compliance</Heading>
      {canManage && (
        <Card>
          <div className={styles.stack}>
            <Heading as="h2">Required for this team</Heading>
            <Text muted>Every active player must have signed these.</Text>
            <LoadState
              loading={waivers.loading}
              error={waivers.error}
              empty={waivers.data?.length === 0}
              emptyText="No waivers yet. Create one under Registrations."
              onRetry={waivers.reload}
            >
              <ul className={styles.list}>
                {(waivers.data ?? [])
                  .filter((w) => w.waiver_versions.length > 0)
                  .map((w) => (
                    <li key={w.id} className={styles.item}>
                      <label className={`${styles.choice} ${styles.grow}`}>
                        <input
                          type="checkbox"
                          checked={(required.data ?? []).includes(w.id)}
                          onChange={(e) => void toggle(w.id, e.target.checked)}
                        />
                        {w.title}
                      </label>
                    </li>
                  ))}
              </ul>
            </LoadState>
          </div>
        </Card>
      )}
      <div className={styles.row}>
        <Badge tone="success">{counts.signed ?? 0} signed</Badge>
        <Badge tone="danger">{counts.missing ?? 0} missing</Badge>
        <Badge tone="warning">{counts.expired ?? 0} expired</Badge>
      </div>
      <Select
        label="Show"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        options={[
          { value: 'problems', label: 'Needs attention' },
          { value: 'all', label: 'Everyone' },
          { value: 'missing', label: 'Missing' },
          { value: 'expired', label: 'Expired' },
          { value: 'signed', label: 'Signed' },
        ]}
      />
      <LoadState
        loading={rows.loading}
        error={rows.error}
        empty={shown.length === 0}
        emptyText={
          data.length === 0
            ? 'No required waivers or no active players yet.'
            : 'Everyone is up to date.'
        }
        onRetry={rows.reload}
      >
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Waiver</th>
                <th scope="col">Status</th>
                <th scope="col">Signed</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.player_id}-${r.waiver_id}`}>
                  <td>
                    {r.first_name} {r.last_name}
                  </td>
                  <td>{r.waiver_title}</td>
                  <td>
                    <Badge tone={TONE[r.status as keyof typeof TONE] ?? 'neutral'}>
                      {LABEL[r.status as keyof typeof LABEL] ?? r.status}
                    </Badge>
                  </td>
                  <td>
                    {r.accepted_at
                      ? new Date(r.accepted_at).toLocaleDateString('en-US', { dateStyle: 'medium' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadState>
      {error ? <FormMessage error={error} /> : null}
    </div>
  );
}

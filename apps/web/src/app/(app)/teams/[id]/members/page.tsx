'use client';

import { friendlyError, TEAM_ROLES } from '@athleit/core';
import { getTeamMembers, removeMember, setMemberRole } from '@athleit/db/api';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { FormMessage, LoadState } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import { Badge, Button, Select } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

const ROLE_OPTIONS = TEAM_ROLES.map((r) => ({
  value: r,
  label: r.charAt(0).toUpperCase() + r.slice(1),
}));

export default function MembersPage() {
  const { team, caps } = useTeam();
  const { userId } = useApp();
  const client = getClient();
  const list = useLoad(() => getTeamMembers(client, team.id), [team.id]);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(id: string, role: (typeof TEAM_ROLES)[number]) {
    setError(null);
    const res = await setMemberRole(client, id, role);
    if (res.error) setError(friendlyError(res.error)); // e.g. the last admin cannot be demoted
    list.reload();
  }
  async function remove(id: string) {
    setError(null);
    const res = await removeMember(client, id);
    if (res.error) setError(friendlyError(res.error));
    list.reload();
  }

  if (!caps.has('members.view'))
    return <p className={styles.notice}>Only team staff can see members.</p>;
  const manage = caps.has('members.manage');

  return (
    <section className={styles.stack}>
      <h2 className={styles.section}>Members</h2>
      <FormMessage error={error} />
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        onRetry={list.reload}
      >
        <ul className={styles.list}>
          {list.data?.map((m) => (
            <li key={m.membership_id} className={styles.item}>
              <div className={styles.grow}>
                <strong>{m.display_name}</strong>
                {m.profile_id === userId && <span className={styles.muted}> (you)</span>}
              </div>
              {manage ? (
                <>
                  <Select
                    label="Role"
                    value={m.role}
                    options={ROLE_OPTIONS}
                    onChange={(e) =>
                      void changeRole(
                        m.membership_id,
                        e.target.value as (typeof TEAM_ROLES)[number],
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    onClick={() => void remove(m.membership_id)}
                    aria-label={`Remove ${m.display_name}`}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <Badge>{m.role}</Badge>
              )}
            </li>
          ))}
        </ul>
      </LoadState>
    </section>
  );
}

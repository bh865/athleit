'use client';

import { guardianSince, orderGuardians } from '@athleit/core';
import { getHouseholdGuardians } from '@athleit/db/api';

import styles from '@/components/app/app.module.css';
import { LoadState } from '@/components/app/states';
import { Avatar, Badge } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

/** Guardians in the household: names only, you first. No remove action. */
export function GuardiansSection({ householdId }: { householdId: string }) {
  const list = useLoad(() => getHouseholdGuardians(getClient(), householdId), [householdId]);
  const rows = orderGuardians(list.data ?? []);
  return (
    <section className={styles.stack} aria-labelledby="guardians-h">
      <h2 className={styles.section} id="guardians-h">
        Guardians
      </h2>
      <p className={styles.muted}>Guardians can see and manage all of your children.</p>
      <LoadState loading={list.loading} error={list.error} onRetry={list.reload}>
        <ul className={styles.list} data-testid="guardians-list">
          {rows.map((g) => (
            <li key={g.profile_id} className={styles.item}>
              <Avatar name={g.display_name} />
              <div className={styles.grow}>
                <strong>{g.display_name}</strong>
                <p className={styles.muted}>Guardian · since {guardianSince(g.created_at)}</p>
              </div>
              {g.is_you ? <Badge>You</Badge> : null}
            </li>
          ))}
        </ul>
        {rows.length === 1 ? (
          <p className={styles.notice}>
            Just you for now. Invite another guardian so someone can step in.
          </p>
        ) : null}
      </LoadState>
    </section>
  );
}

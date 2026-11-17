'use client';

import { ageOn, can, canHaveOwnLogin, friendlyError } from '@athleit/core';
import { decidePlayerLoginClaim, getPlayerLoginClaims, listChildren } from '@athleit/db/api';
import Link from 'next/link';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { InvitePanel } from '@/components/app/invite-panel';
import { FormMessage, LoadState } from '@/components/app/states';
import { DueCard } from '@/components/payments/home-cards';
import { NextUpCard } from '@/components/schedule/next-up-card';
import { Avatar, Badge, Button, Card, Icon } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function FamilyPage() {
  const { contexts } = useApp();
  const client = getClient();
  const family = contexts.find((c) => c.kind === 'family') ?? null;
  const children = useLoad(() => listChildren(client), []);
  const claims = useLoad(() => getPlayerLoginClaims(client), []);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setClaimError(null);
    const res = await decidePlayerLoginClaim(client, id, approve);
    if (res.error) setClaimError(friendlyError(res.error));
    claims.reload();
    children.reload();
  }

  return (
    <>
      <NextUpCard />
      <DueCard />
      <div className={`${styles.row} ${styles.between}`}>
        <h1 className={styles.title}>{family?.title ?? 'Your family'}</h1>
        <Link href="/family/children/new" className={styles.link}>
          <Icon name="plus" /> Add a child
        </Link>
      </div>

      <p className={styles.notice}>
        Children under 13 never have their own login. A parent or guardian manages everything for
        them.
      </p>

      <section className={styles.stack} aria-labelledby="children-h">
        <h2 className={styles.section} id="children-h">
          Children
        </h2>
        <LoadState
          loading={children.loading}
          error={children.error}
          empty={children.data?.length === 0}
          emptyText="You haven’t added a child yet. You don’t need to join a team first."
          emptyAction={
            <Link href="/family/children/new" className={styles.link}>
              Add a child
            </Link>
          }
          onRetry={children.reload}
        >
          <ul className={styles.list} data-testid="children-list">
            {children.data?.map((c) => {
              const teams = c.team_players.filter((tp) => tp.teams);
              return (
                <li key={c.id}>
                  <Link href={`/family/children/${c.id}`} className={styles.item}>
                    <Avatar name={`${c.first_name} ${c.last_name}`} />
                    <div className={styles.grow}>
                      <strong>
                        {c.first_name} {c.last_name}
                      </strong>
                      <p className={styles.muted}>
                        {ageOn(c.date_of_birth)} years old
                        {teams.length > 0
                          ? ` · ${teams.map((tp) => tp.teams?.name).join(', ')}`
                          : ' · Not on a team yet'}
                      </p>
                    </div>
                    {c.profile_id ? (
                      <Badge tone="success">Has login</Badge>
                    ) : canHaveOwnLogin(c.date_of_birth) ? null : (
                      <Badge>No login (under 13)</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </LoadState>
      </section>

      {can(family, 'family.claimReview') && (claims.data?.length ?? 0) > 0 && (
        <section className={styles.stack} aria-labelledby="claims-h">
          <h2 className={styles.section} id="claims-h">
            Login requests
          </h2>
          <FormMessage error={claimError} />
          <ul className={styles.list}>
            {claims.data?.map((c) => (
              <li key={c.claim_id} className={styles.item}>
                <div className={styles.grow}>
                  <strong>
                    {c.claimant_name} wants to sign in as {c.player_first_name}
                  </strong>
                  <p className={styles.muted}>{c.claimant_email}</p>
                </div>
                <Button onClick={() => void decide(c.claim_id, true)}>Approve</Button>
                <Button variant="secondary" onClick={() => void decide(c.claim_id, false)}>
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {family && (
        <Card className={styles.stack}>
          <h2 className={styles.section}>Invite another guardian</h2>
          <p className={styles.muted}>
            A guardian can see and manage all of your children. Send the link only to someone you
            trust.
          </p>
          <InvitePanel
            target={{ householdId: family.id }}
            roles={[{ value: 'guardian', label: 'Guardian' }]}
          />
        </Card>
      )}
    </>
  );
}

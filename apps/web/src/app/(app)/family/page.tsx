'use client';

import { can, friendlyError } from '@athleit/core';
import { decidePlayerLoginClaim, getPlayerLoginClaims, listChildren } from '@athleit/db/api';
import Link from 'next/link';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { InvitePanel } from '@/components/app/invite-panel';
import { FormMessage, LoadState } from '@/components/app/states';
import { ChildCard } from '@/components/family/child-card';
import familyStyles from '@/components/family/family.module.css';
import { GuardiansSection } from '@/components/family/guardians-section';
import { JoinFamilyDialog } from '@/components/family/join-family-dialog';
import { Button, ButtonLink, Card, EmptyState, Icon, PageHeader } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function FamilyPage() {
  const { contexts } = useApp();
  const client = getClient();
  const family = contexts.find((c) => c.kind === 'family') ?? null;
  const children = useLoad(() => listChildren(client), []);
  const claims = useLoad(() => getPlayerLoginClaims(client), []);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  async function decide(id: string, approve: boolean) {
    setClaimError(null);
    const res = await decidePlayerLoginClaim(client, id, approve);
    if (res.error) setClaimError(friendlyError(res.error));
    claims.reload();
    children.reload();
  }

  if (!family) {
    return (
      <>
        <PageHeader title="Family" subtitle="Not part of a family yet" />
        <Card className={styles.stack} data-testid="no-family">
          <EmptyState
            icon="house-line"
            title="Set up your family"
            body="Add your children, or join a family a guardian has already set up."
            action={
              <div className={familyStyles.rowActions}>
                <ButtonLink href="/family/children/new">
                  <Icon name="plus" size="sm" /> Add a child
                </ButtonLink>
                <Button
                  variant="secondary"
                  onClick={() => setJoinOpen(true)}
                  data-testid="join-family"
                >
                  Join a family with a code
                </Button>
              </div>
            }
          />
        </Card>
        <JoinFamilyDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      </>
    );
  }

  const kids = children.data ?? [];
  return (
    <>
      <PageHeader
        title={family.title}
        subtitle="Children and guardians"
        actions={
          <ButtonLink href="/family/children/new">
            <Icon name="plus" size="sm" /> Add a child
          </ButtonLink>
        }
      />

      <section className={styles.stack} aria-labelledby="children-h">
        <h2 className={styles.section} id="children-h">
          Children
        </h2>
        <LoadState
          loading={children.loading}
          error={children.error}
          empty={kids.length === 0}
          emptyText="Add your first child. You don’t need to join a team first."
          emptyAction={
            <ButtonLink href="/family/children/new">
              <Icon name="plus" size="sm" /> Add a child
            </ButtonLink>
          }
          onRetry={children.reload}
        >
          <ul className={familyStyles.grid} data-testid="children-list">
            {kids.map((c) => (
              <li key={c.id}>
                <ChildCard child={c} />
              </li>
            ))}
            <li>
              <Link href="/family/children/new" className={familyStyles.addCard}>
                <Icon name="plus" size="md" /> Add a child
              </Link>
            </li>
          </ul>
        </LoadState>
        <p className={styles.muted}>Children under 13 never have their own login.</p>
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

      <GuardiansSection householdId={family.id} />

      {can(family, 'family.manage') && (
        <Card className={styles.stack}>
          <h2 className={styles.section}>Invite another guardian</h2>
          <p className={styles.muted}>
            A guardian can see and manage every child. Only invite someone you trust.
          </p>
          <InvitePanel
            target={{ householdId: family.id }}
            roles={[{ value: 'guardian', label: 'Guardian' }]}
            childNames={kids.map((k) => k.first_name)}
          />
        </Card>
      )}

      <Card className={familyStyles.rowActions} data-testid="have-family-code">
        <div className={styles.grow}>
          <h2 className={styles.section}>Have a family code?</h2>
          <p className={styles.muted}>Join a family a guardian has already set up.</p>
        </div>
        <Button variant="secondary" onClick={() => setJoinOpen(true)} data-testid="join-family">
          Join a family
        </Button>
      </Card>
      <JoinFamilyDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}

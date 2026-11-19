import { can, friendlyError } from '@athleit/core';
import { decidePlayerLoginClaim, getPlayerLoginClaims, listChildren } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { InvitePanel } from '@/components/app/invite-panel';
import { FormMessage, H1, H2, LoadState } from '@/components/app/kit';
import { ChildCard } from '@/components/family/child-card';
import { GuardiansSection } from '@/components/family/guardians-section';
import { JoinFamilySheet } from '@/components/family/join-family-sheet';
import { Button, Card, EmptyState, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

export default function FamilyScreen() {
  const { contexts } = useApp();
  const router = useRouter();
  const family = contexts.find((c) => c.kind === 'family') ?? null;
  const children = useLoad(() => listChildren(supabase), []);
  const claims = useLoad(() => getPlayerLoginClaims(supabase), []);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  async function decide(id: string, approve: boolean) {
    setClaimError(null);
    const res = await decidePlayerLoginClaim(supabase, id, approve);
    if (res.error) setClaimError(friendlyError(res.error));
    claims.reload();
    children.reload();
  }

  if (!family) {
    return (
      <AppScreen>
        <H1>Family</H1>
        <View testID="no-family">
          <EmptyState
            icon="house-line"
            title="Set up your family"
            body="Add your children, or join a family a guardian has already set up."
            action={
              <View style={{ gap: space[2], alignSelf: 'stretch' }}>
                <Button title="Add a child" onPress={() => router.push('/family/children/new')} />
                <Button
                  title="Join a family with a code"
                  variant="secondary"
                  onPress={() => setJoinOpen(true)}
                  testID="join-family"
                />
              </View>
            }
          />
        </View>
        <JoinFamilySheet open={joinOpen} onClose={() => setJoinOpen(false)} />
      </AppScreen>
    );
  }

  const kids = children.data ?? [];
  return (
    <AppScreen>
      <H1>{family.title}</H1>
      <Text muted>Children and guardians</Text>

      <View style={{ gap: space[3] }}>
        <H2>Children</H2>
        <LoadState
          loading={children.loading}
          error={children.error}
          empty={kids.length === 0}
          emptyText="Add your first child. You don’t need to join a team first."
          onRetry={children.reload}
        >
          <View style={{ gap: space[3] }} testID="children-list">
            {kids.map((c) => (
              <ChildCard key={c.id} child={c} />
            ))}
          </View>
        </LoadState>
        <Button
          title="Add a child"
          icon="plus"
          variant={kids.length === 0 ? 'primary' : 'secondary'}
          onPress={() => router.push('/family/children/new')}
        />
        <Text muted>Children under 13 never have their own login.</Text>
      </View>

      {can(family, 'family.claimReview') && (claims.data?.length ?? 0) > 0 && (
        <View style={{ gap: space[3] }}>
          <H2>Login requests</H2>
          <FormMessage error={claimError} />
          {claims.data?.map((c) => (
            <Card key={c.claim_id} style={{ gap: space[3] }}>
              <Text variant="bodyBold">
                {c.claimant_name} wants to sign in as {c.player_first_name}
              </Text>
              <Text variant="caption" muted>
                {c.claimant_email}
              </Text>
              <Button title="Approve" onPress={() => void decide(c.claim_id, true)} />
              <Button
                title="Decline"
                variant="secondary"
                onPress={() => void decide(c.claim_id, false)}
              />
            </Card>
          ))}
        </View>
      )}

      <GuardiansSection householdId={family.id} />

      {can(family, 'family.manage') && (
        <Card style={{ gap: space[3] }}>
          <H2>Invite another guardian</H2>
          <Text muted>
            A guardian can see and manage every child. Only invite someone you trust.
          </Text>
          <InvitePanel
            target={{ householdId: family.id }}
            roles={[{ value: 'guardian', label: 'Guardian' }]}
            childNames={kids.map((k) => k.first_name)}
          />
        </Card>
      )}

      <Card style={{ gap: space[3] }} testID="have-family-code">
        <H2>Have a family code?</H2>
        <Text muted>Join a family a guardian has already set up.</Text>
        <Button
          title="Join a family"
          variant="secondary"
          onPress={() => setJoinOpen(true)}
          testID="join-family"
        />
      </Card>
      <JoinFamilySheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </AppScreen>
  );
}

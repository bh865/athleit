import { ageOn, can, canHaveOwnLogin, friendlyError } from '@athleit/core';
import { decidePlayerLoginClaim, getPlayerLoginClaims, listChildren } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { InvitePanel } from '@/components/app/invite-panel';
import { Badge, FormMessage, H1, H2, ListItem, LoadState, Notice } from '@/components/app/kit';
import { Button, Card, Text } from '@/components/ui';
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

  async function decide(id: string, approve: boolean) {
    setClaimError(null);
    const res = await decidePlayerLoginClaim(supabase, id, approve);
    if (res.error) setClaimError(friendlyError(res.error));
    claims.reload();
    children.reload();
  }

  return (
    <AppScreen>
      <H1>{family?.title ?? 'Your family'}</H1>
      <Notice>
        Children under 13 never have their own login. A parent or guardian manages everything for
        them.
      </Notice>

      <View style={{ gap: space[3] }}>
        <H2>Children</H2>
        <LoadState
          loading={children.loading}
          error={children.error}
          empty={children.data?.length === 0}
          emptyText="You haven’t added a child yet. You don’t need to join a team first."
          onRetry={children.reload}
        >
          <View style={{ gap: space[2] }} testID="children-list">
            {children.data?.map((c) => {
              const teams = c.team_players.filter((tp) => tp.teams);
              return (
                <ListItem
                  key={c.id}
                  title={`${c.first_name} ${c.last_name}`}
                  subtitle={`${ageOn(c.date_of_birth)} years old${
                    teams.length
                      ? ` · ${teams.map((tp) => tp.teams?.name).join(', ')}`
                      : ' · Not on a team yet'
                  }`}
                  right={
                    c.profile_id ? (
                      <Badge tone="success">Has login</Badge>
                    ) : canHaveOwnLogin(c.date_of_birth) ? null : (
                      <Badge>No login (under 13)</Badge>
                    )
                  }
                  onPress={() => router.push(`/family/children/${c.id}`)}
                />
              );
            })}
          </View>
        </LoadState>
        <Button
          title="Add a child"
          variant="secondary"
          onPress={() => router.push('/family/children/new')}
        />
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

      {family && (
        <Card style={{ gap: space[3] }}>
          <H2>Invite another guardian</H2>
          <Text muted>
            A guardian can see and manage all of your children. Send the link only to someone you
            trust.
          </Text>
          <InvitePanel
            target={{ householdId: family.id }}
            roles={[{ value: 'guardian', label: 'Guardian' }]}
          />
        </Card>
      )}
    </AppScreen>
  );
}

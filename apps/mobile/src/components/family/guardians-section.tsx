import { guardianSince, orderGuardians } from '@athleit/core';
import { getHouseholdGuardians } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { View } from 'react-native';

import { Badge, H2, ListItem, LoadState, Notice } from '@/components/app/kit';
import { ListGroup, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** Guardians in the household: names only, you first. No remove action. */
export function GuardiansSection({ householdId }: { householdId: string }) {
  const list = useLoad(() => getHouseholdGuardians(supabase, householdId), [householdId]);
  const rows = orderGuardians(list.data ?? []);
  return (
    <View style={{ gap: space[3] }}>
      <H2>Guardians</H2>
      <Text muted>Guardians can see and manage all of your children.</Text>
      <LoadState loading={list.loading} error={list.error} onRetry={list.reload}>
        <ListGroup testID="guardians-list">
          {rows.map((g) => (
            <ListItem
              key={g.profile_id}
              avatarName={g.display_name}
              title={g.display_name}
              subtitle={`Guardian · since ${guardianSince(g.created_at)}`}
              right={g.is_you ? <Badge>You</Badge> : null}
            />
          ))}
        </ListGroup>
        {rows.length === 1 ? (
          <Notice>Just you for now. Invite another guardian so someone can step in.</Notice>
        ) : null}
      </LoadState>
    </View>
  );
}

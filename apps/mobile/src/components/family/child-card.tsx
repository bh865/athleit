import { childCard, type ChildLike } from '@athleit/core';
import { getPhotoUrl, type Result } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Badge } from '@/components/app/kit';
import { Avatar, Button, Card, Chip, Icon, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** A child's profile card on the Family screen. The whole card opens the child. */
export function ChildCard({ child }: { child: ChildLike }) {
  const router = useRouter();
  const c = childCard(child);
  const path = c.photoPath;
  const photo = useLoad(
    () =>
      path
        ? getPhotoUrl(supabase, path)
        : Promise.resolve({ data: null, error: null } as Result<string | null>),
    [path],
  );
  return (
    <Card style={{ gap: space[3] }} testID="child-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.name}, ${c.age} years old. View profile`}
        onPress={() => router.push(`/family/children/${c.id}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
      >
        <Avatar name={c.name} size="lg" src={photo.data} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold" numberOfLines={1}>
            {c.name}
          </Text>
          <Text variant="mono" muted>
            {c.age} years old
          </Text>
        </View>
        <Icon name="caret-right" size="sm" />
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        {c.teams.map((t) => (
          <Chip key={t} label={t} />
        ))}
        {c.notOnTeam ? <Text muted>Not on a team yet</Text> : null}
      </View>
      {c.notOnTeam ? (
        <Button
          title="Join a team"
          variant="secondary"
          onPress={() => router.push(`/join?player=${c.id}` as never)}
        />
      ) : null}
      {c.badge === 'has-login' ? (
        <Badge tone="success">Has login</Badge>
      ) : c.badge === 'no-login-under-13' ? (
        <Badge>No login (under 13)</Badge>
      ) : null}
    </Card>
  );
}

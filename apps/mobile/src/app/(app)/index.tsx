import type { Profile } from '@athleit/db';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Screen, Text, ThemeToggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Protected Home screen: shows the signed-in user's profile display name. */
export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Pick<Profile, 'display_name'> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // RLS guarantees this returns only the signed-in user's own row.
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const name = profile?.display_name ?? session?.user.email ?? '…';

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <ThemeToggle />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
      <Card style={{ gap: 4 }}>
        <Text size="sm" muted>
          Welcome back
        </Text>
        <Text size="3xl" weight="bold" testID="display-name">
          {name}
        </Text>
        <Text size="xs" muted mono style={{ marginTop: 12 }}>
          {userId}
        </Text>
      </Card>
    </Screen>
  );
}

import { space } from '@athleit/tokens';
import { getMySupportRequests, type RequesterStatus } from '@athleit/db/support';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { LoadState } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, Chip, ListGroup, ListRow, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const FILTERS: { value: RequesterStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_requester', label: 'Waiting on you' },
  { value: 'solved', label: 'Solved' },
];
const MARK = { open: '●', waiting_on_requester: '▲', solved: '✓', closed: '■' } as const;
const WORD = {
  open: 'Open',
  waiting_on_requester: 'Waiting on you',
  solved: 'Solved',
  closed: 'Closed',
} as const;

export default function RequestsScreen() {
  useScreenTitle('Your requests');
  const router = useRouter();
  const [status, setStatus] = useState<RequesterStatus | null>(null);
  const { data, error, loading, reload } = useLoad(
    () => getMySupportRequests(supabase, { status }),
    [status],
  );
  // Refresh when the screen comes back into view (for example after replying).
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return (
    <AppScreen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <View style={{ gap: space[4] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.label}
              label={f.label}
              selected={status === f.value}
              onPress={() => setStatus(f.value)}
              accessibilityRole="button"
            />
          ))}
        </View>
        <LoadState
          loading={loading && !data}
          error={error}
          empty={data?.items.length === 0}
          emptyText="You haven’t contacted us yet"
          onRetry={reload}
          emptyAction={
            <Button title="Contact support" onPress={() => router.push('/help/contact' as never)} />
          }
        >
          <ListGroup>
            {(data?.items ?? []).map((r, i, arr) => (
              <ListRow
                key={r.ref}
                title={`${r.unread ? '● ' : ''}${r.subject}`}
                subtitle={`${r.ref} · ${MARK[r.status]} ${WORD[r.status]}`}
                last={i === arr.length - 1}
                accessibilityLabel={`${r.unread ? 'New reply. ' : ''}${r.subject}, ${WORD[r.status]}`}
                onPress={() => router.push(`/help/requests/${r.ref}` as never)}
              />
            ))}
          </ListGroup>
        </LoadState>
        <Text variant="caption" muted>
          Pull down to refresh.
        </Text>
      </View>
    </AppScreen>
  );
}

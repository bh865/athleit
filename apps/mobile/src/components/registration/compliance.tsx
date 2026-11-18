import { getWaiverCompliance } from '@athleit/db/registration';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Choice, H2, ListItem, LoadState } from '@/components/app/kit';
import { ListGroup, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const TONE = { signed: 'success', missing: 'danger', expired: 'warning' } as const;
const FILTERS = [
  { value: 'problems', label: 'Needs attention' },
  { value: 'all', label: 'Everyone' },
] as const;

/** Who has signed what. Names and statuses only: no signed text, no medical answers. Required waivers are set on the web. */
export function ComplianceSection({ teamId }: { teamId: string }) {
  const rows = useLoad(() => getWaiverCompliance(supabase, teamId), [teamId]);
  const [filter, setFilter] = useState<'problems' | 'all'>('problems');
  const data = rows.data ?? [];
  const shown = filter === 'all' ? data : data.filter((r) => r.status !== 'signed');
  const missing = data.filter((r) => r.status === 'missing').length;
  const expired = data.filter((r) => r.status === 'expired').length;
  return (
    <View style={{ gap: space[3] }}>
      <H2>Waiver compliance</H2>
      <Text muted>
        {missing} missing · {expired} expired · {data.length - missing - expired} signed
      </Text>
      <Choice label="Show" value={filter} options={FILTERS} onChange={setFilter} />
      <LoadState
        loading={rows.loading}
        error={rows.error}
        empty={shown.length === 0}
        emptyText={
          data.length === 0
            ? 'No required waivers or no active players yet.'
            : 'Everyone is up to date.'
        }
        onRetry={rows.reload}
      >
        <ListGroup>
          {shown.map((r) => (
            <ListItem
              key={`${r.player_id}-${r.waiver_id}`}
              title={`${r.first_name} ${r.last_name}`}
              subtitle={r.waiver_title}
              right={
                <Badge tone={TONE[r.status as keyof typeof TONE] ?? 'neutral'}>{r.status}</Badge>
              }
            />
          ))}
        </ListGroup>
      </LoadState>
    </View>
  );
}

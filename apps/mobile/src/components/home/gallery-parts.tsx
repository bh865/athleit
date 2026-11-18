import type { AttentionItem } from '@athleit/core';
import { space } from '@athleit/tokens';
import { View } from 'react-native';

import { Badge, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
import { Stat, Tile } from './tiles';

const ITEMS: AttentionItem[] = [
  { kind: 'rsvp', key: 'a', label: 'RSVP for Maya', detail: 'Game Sat 10:00 AM', href: '/' },
  { kind: 'waiver', key: 'b', label: 'Sign Maya’s waiver', detail: 'Expired Nov 15', href: '/' },
  { kind: 'payment', key: 'c', label: 'Pay jersey fee', detail: '$45.00 · due in 3 days', href: '/' },
];
const OK = { loading: false, error: null, reload: () => undefined };

/** Static fixtures only (no network). */
export function HomeGallery() {
  return (
    <View style={{ gap: space[4] }}>
      <AttentionStrip shown={ITEMS} more={[]} loading={false} />
      <AttentionStrip shown={[]} more={[]} loading={false} />
      <Tile id="g-record" title="Team record" res={OK} hasData empty={false}>
        <View style={{ flexDirection: 'row', gap: space[6] }}>
          <Stat v={5} l="Wins" />
          <Stat v={2} l="Losses" />
          <Stat v={1} l="Ties" />
        </View>
        <Text variant="caption" muted>
          Fall 2026
        </Text>
      </Tile>
      <Tile id="g-waivers" title="Waivers" res={OK} hasData empty={false}>
        <Badge tone="warning">Eli · Expired</Badge>
        <Badge tone="danger">Zara · Missing</Badge>
      </Tile>
      <Tile id="g-loading" title="Registrations" res={{ ...OK, loading: true }} hasData={false} empty={false}>
        {null}
      </Tile>
      <Tile id="g-error" title="Join requests" res={{ ...OK, error: 'x' }} hasData={false} empty={false}>
        {null}
      </Tile>
    </View>
  );
}

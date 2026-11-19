import { deriveAttention, type AttentionItem } from '@athleit/core';
import { space } from '@athleit/tokens';
import { View } from 'react-native';

import { Badge, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
import { Stat, Tile } from './tiles';

const NOW = new Date('2026-11-19T17:00:00Z');
const ITEMS: AttentionItem[] = [
  {
    kind: 'waiver',
    key: 'b',
    label: 'Sign Maya’s waiver',
    detail: 'Liability waiver expired',
    href: '/',
    dueAt: '2026-11-15T17:00:00Z',
    dueMode: 'expired',
    placeTag: 'Household',
  },
  {
    kind: 'rsvp',
    key: 'a',
    label: 'RSVP for Maya',
    href: '/',
    dueAt: '2026-11-21T15:00:00Z',
    dueMode: 'event',
    eventNoun: 'Game',
    placeTag: 'Household',
    action: { type: 'rsvp', eventId: 'e1', playerId: 'p1', firstName: 'Maya' },
  },
  {
    kind: 'joinRequests',
    key: 'd',
    label: '2 join requests',
    detail: 'Approve or decline',
    href: '/',
    count: 2,
    placeTag: 'U12 Falcons',
  },
];
const NONE = { shown: [], more: [], all: [], lead: null };
const noop = () => undefined;
const OK = { loading: false, error: null, reload: () => undefined };

/** Static fixtures only (no network). */
export function HomeGallery() {
  return (
    <View style={{ gap: space[4] }}>
      <AttentionStrip
        attention={deriveAttention(ITEMS, NOW)}
        loading={false}
        error={null}
        onRetry={noop}
        onResolved={noop}
        now={NOW}
      />
      <AttentionStrip
        attention={NONE}
        loading={false}
        error={null}
        onRetry={noop}
        onResolved={noop}
        now={NOW}
      />
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
      <Tile
        id="g-loading"
        title="Registrations"
        res={{ ...OK, loading: true }}
        hasData={false}
        empty={false}
      >
        {null}
      </Tile>
      <Tile
        id="g-error"
        title="Join requests"
        res={{ ...OK, error: 'x' }}
        hasData={false}
        empty={false}
      >
        {null}
      </Tile>
    </View>
  );
}

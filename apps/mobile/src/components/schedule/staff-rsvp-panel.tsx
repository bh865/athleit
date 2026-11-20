import { RSVP_LABELS, friendlyError, nudgeResultText, nudgeState, type RsvpStatus } from '@athleit/core';
import {
  nudgeRsvpNonResponders,
  staffSetRsvp,
  type EventDetail,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { componentTokens, space } from '@athleit/tokens';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Notice } from '@/components/app/kit';
import { Button, Chip, Icon, Sheet, Text, TextField, useTheme, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Filter = 'all' | RsvpStatus | 'no_reply';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'going', label: 'Going' },
  { key: 'not_going', label: 'Can’t go' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no_reply', label: 'No reply' },
];
const ICON = { going: 'check-circle', not_going: 'x-circle', maybe: 'question' } as const;

/** Staff only: names with status and notes, a filter and search, Set RSVP on a player's behalf, and Nudge. */
export function StaffRsvpPanel({
  event,
  summary,
  detail,
  onChanged,
}: {
  event: EventDetail;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[];
  onChanged: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [nudging, setNudging] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return detail.filter((p) => {
      if (filter === 'no_reply' ? p.status != null : filter !== 'all' && p.status !== filter) return false;
      return !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
    });
  }, [detail, filter, query]);
  const nudge = nudgeState({ status: event.status as 'scheduled' | 'cancelled', ends_at: event.ends_at, no_reply: summary?.no_reply ?? 0 }, new Date());

  async function setFor(playerId: string, status: RsvpStatus) {
    setBusy(playerId);
    setError(null);
    const res = await staffSetRsvp(supabase, event.id, playerId, status);
    setBusy(null);
    if (res.error) setError(friendlyError(res.error));
    else {
      setEditing(null);
      onChanged();
    }
  }
  async function sendNudge() {
    setNudging(true);
    const res = await nudgeRsvpNonResponders(supabase, event.id);
    setNudging(false);
    setConfirm(false);
    if (res.error) setError(friendlyError(res.error));
    else {
      setError(null);
      toast(nudgeResultText(res.data));
    }
  }

  return (
    <View style={{ gap: space[3] }} testID="rsvp-panel">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Replies</Text>
        <Button title="Nudge" icon="bell-ringing" variant="secondary" disabled={!nudge.canNudge} onPress={() => setConfirm(true)} testID="nudge" />
      </View>
      {!nudge.canNudge ? (
        <Text variant="caption" muted>
          {nudge.reason}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityLabel="Filter players by reply">
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      <TextField label="Search players" value={query} onChangeText={setQuery} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={{ borderRadius: 16, backgroundColor: c.surface, paddingHorizontal: space[4] }} testID="rsvp-list">
        {rows.length === 0 ? (
          <Text muted style={{ paddingVertical: space[3] }}>
            No players match.
          </Text>
        ) : (
          rows.map((p, i) => {
            const status = p.status as RsvpStatus | null;
            const open = editing === p.player_id;
            return (
              <View key={p.player_id} style={{ borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderColor: c.line, paddingVertical: space[2], gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold">
                      {p.first_name} {p.last_name}
                    </Text>
                    {p.note ? (
                      <Text variant="caption" muted>
                        {p.note}
                      </Text>
                    ) : null}
                    {p.set_by_staff && status ? (
                      <Text variant="caption" muted>
                        Set by staff
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }} accessible accessibilityLabel={status ? RSVP_LABELS[status] : 'No reply'}>
                    <Icon name={status ? ICON[status] : 'circle-dashed'} weight={status ? 'fill' : 'regular'} color={status ? c.ink : c.muted} />
                    <Text variant="caption" muted={!status}>
                      {status ? RSVP_LABELS[status] : 'No reply'}
                    </Text>
                  </View>
                  {event.status !== 'cancelled' ? (
                    <Button
                      title="Set RSVP"
                      variant="ghost"
                      accessibilityLabel={`Set RSVP for ${p.first_name} ${p.last_name}`}
                      accessibilityState={{ expanded: open }}
                      onPress={() => setEditing(open ? null : p.player_id)}
                    />
                  ) : null}
                </View>
                {open ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityLabel={`Set RSVP for ${p.first_name}`}>
                    {(['going', 'not_going', 'maybe'] as const).map((k) => (
                      <Button key={k} title={RSVP_LABELS[k]} variant={status === k ? 'primary' : 'secondary'} accessibilityState={{ selected: status === k }} disabled={busy === p.player_id} onPress={() => setFor(p.player_id, k)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Remind families?" level="modal">
        <View style={{ gap: space[4] }}>
          <Text variant="heading">Remind families?</Text>
          <Text muted>
            {nudge.canNudge ? nudge.confirm : ''} They get the usual RSVP reminder. You can nudge an event once every 6 hours.
          </Text>
          <Button title="Send reminder" onPress={sendNudge} loading={nudging} />
          <Button title="Not now" variant="ghost" onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </View>
  );
}

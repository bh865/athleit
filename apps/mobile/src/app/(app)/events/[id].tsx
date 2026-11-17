import {
  EVENT_TYPE_LABELS,
  describeEventTime,
  localDateKey,
  queryRangeForDays,
  type RsvpStatus,
} from '@athleit/core';
import {
  getEvent,
  getHouseholdScheduleRange,
  getRsvpDetail,
  getRsvpSummary,
  type EventDetail,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Notice } from '@/components/app/kit';
import { CancelSheet, ResultSheet } from '@/components/schedule/event-actions';
import { RsvpActions, type ChildRsvp } from '@/components/schedule/rsvp-actions';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Text,
  useTheme,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { viewerZone } from '@/lib/viewer-zone';

interface Loaded {
  event: EventDetail;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[] | null;
  kids: ChildRsvp[];
}

async function loadAll(eventId: string): Promise<Loaded | 'missing' | 'error'> {
  const ev = await getEvent(supabase, eventId);
  if (ev.error) return 'error';
  if (!ev.data) return 'missing';
  const event = ev.data;
  const day = localDateKey(event.starts_at, event.timezone);
  const { from, to } = queryRangeForDays(day, day);
  const [summary, detail, mine] = await Promise.all([
    getRsvpSummary(supabase, eventId),
    event.is_staff ? getRsvpDetail(supabase, eventId) : Promise.resolve(null),
    event.is_staff ? Promise.resolve(null) : getHouseholdScheduleRange(supabase, from, to),
  ]);
  const kids: ChildRsvp[] = (mine?.data ?? [])
    .filter((r) => r.event_id === eventId)
    .map((r) => ({
      player_id: r.player_id,
      first_name: r.player_first_name,
      status: (r.rsvp_status as RsvpStatus | null) ?? null,
    }));
  return { event, summary: summary.data ?? null, detail: detail?.data ?? null, kids };
}

const STATUS_ICON = {
  going: { name: 'check-circle', tone: 'ok', label: 'Going' },
  not_going: { name: 'x-circle', tone: 'bad', label: 'Can’t go' },
  maybe: { name: 'question', tone: 'muted', label: 'Maybe' },
} as const;

/** Event detail (deep-link target): glass back button, kicker, title, facts card, mono counts, RSVP pills. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const c = theme.color;
  const [state, setState] = useState<Loaded | 'loading' | 'missing' | 'error'>('loading');
  const revision = useRef<number | null>(null);
  const [updated, setUpdated] = useState(false);
  const [sheet, setSheet] = useState<'cancel' | 'result' | null>(null);

  const reload = useCallback(async () => {
    const next = await loadAll(id);
    if (typeof next !== 'string') {
      if (revision.current !== null && revision.current !== next.event.revision) setUpdated(true);
      revision.current = next.event.revision;
    }
    setState(next);
  }, [id]);

  useEffect(() => {
    let live = true;
    void loadAll(id).then((next) => {
      if (!live) return;
      if (typeof next !== 'string') revision.current = next.event.revision;
      setState(next);
    });
    // Live counts for staff and "Updated" for everyone (Realtime respects RLS).
    const channel = supabase
      .channel(`event:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps', filter: `event_id=eq.${id}` },
        () => void reload(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(channel);
    };
  }, [id, reload]);

  if (state === 'loading')
    return (
      <AppScreen>
        <LoadingSkeleton />
      </AppScreen>
    );
  if (state === 'error')
    return (
      <AppScreen>
        <ErrorState message="We couldn’t load this event." onRetry={() => void reload()} />
      </AppScreen>
    );
  if (state === 'missing')
    return (
      <AppScreen>
        <EmptyState
          icon="calendar-blank"
          title="Event not found"
          body="It may have been deleted, or you may not have access."
        />
      </AppScreen>
    );

  const { event, summary, detail, kids } = state;
  const t = describeEventTime(event.starts_at, event.ends_at, event.timezone, viewerZone());
  const cancelled = event.status === 'cancelled';
  const ended = new Date(event.ends_at) < new Date();
  const started = new Date(event.starts_at) <= new Date();
  const place = event.location_name ?? event.location_text;
  const counts = summary
    ? [
        { v: summary.going, l: 'Going' },
        { v: summary.not_going, l: 'Can’t go' },
        { v: summary.no_reply, l: 'No reply' },
      ]
    : [];

  return (
    <AppScreen>
      <View style={{ gap: space[1] }}>
        <Text variant="label" muted>
          {EVENT_TYPE_LABELS[event.type as 'game']}
        </Text>
        <Text variant="title" testID="event-title">
          {event.title}
        </Text>
        {t.viewerLocalLabel ? <Text muted>Your time: {t.viewerLocalLabel}</Text> : null}
      </View>

      {cancelled ? (
        <Notice tone="error" testID="cancelled-banner">
          Cancelled{event.cancelled_reason ? `: ${event.cancelled_reason}` : ''}
        </Notice>
      ) : null}
      {updated && !cancelled ? (
        <Notice testID="updated-banner">Updated: the time or place changed.</Notice>
      ) : null}

      <View
        style={{
          borderRadius: radius.lg,
          borderWidth: componentTokens.card.border,
          borderColor: c.line,
          backgroundColor: c.surface,
          paddingHorizontal: space[4],
        }}
      >
        <Fact
          icon="calendar-blank"
          text={`${t.dateLabel} · ${t.startLabel} ${t.zoneLabel}`}
          last={!place && !event.opponent_name}
        />
        {place ? (
          <Fact
            icon="map-pin"
            text={place}
            sub={event.location_address ?? undefined}
            last={!event.opponent_name}
          />
        ) : null}
        {event.type === 'game' && event.opponent_name ? (
          <Fact
            icon="flag"
            text={`vs. ${event.opponent_name}${event.home_away ? ` (${event.home_away})` : ''}`}
            last
          />
        ) : null}
      </View>
      {event.arrive_early_minutes ? (
        <Text muted>Arrive {event.arrive_early_minutes} minutes early.</Text>
      ) : null}
      {event.notes ? <Text>{event.notes}</Text> : null}
      {event.type === 'game' && event.outcome ? (
        <Text variant="heading" testID="result-line">
          {event.outcome === 'win' ? 'Won' : event.outcome === 'loss' ? 'Lost' : 'Tied'}{' '}
          {event.our_score}–{event.their_score}
        </Text>
      ) : null}

      {!cancelled && counts.length > 0 ? (
        <View
          style={{ flexDirection: 'row', gap: space[8], paddingHorizontal: space[2] }}
          accessibilityRole="summary"
          accessibilityLabel={counts.map((x) => `${x.v} ${x.l}`).join(', ')}
        >
          {counts.map((x) => (
            <View key={x.l}>
              <Text variant="monoLg">{x.v}</Text>
              <Text variant="caption" muted>
                {x.l}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {event.is_staff && detail && !cancelled ? (
        <View
          style={{
            borderRadius: radius.lg,
            backgroundColor: c.surface,
            paddingHorizontal: space[4],
          }}
          testID="rsvp-list"
        >
          {detail.map((p, i) => {
            const s = p.status ? STATUS_ICON[p.status as keyof typeof STATUS_ICON] : null;
            return (
              <View
                key={p.player_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  minHeight: componentTokens.avatar.lg,
                  borderBottomWidth: i === detail.length - 1 ? 0 : 1,
                  borderColor: c.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">
                    {p.first_name} {p.last_name}
                  </Text>
                  {p.note ? (
                    <Text variant="caption" muted>
                      {p.note}
                    </Text>
                  ) : null}
                </View>
                <View accessibilityLabel={s ? s.label : 'No reply'}>
                  <Icon
                    name={s ? s.name : 'clock'}
                    weight="fill"
                    size="lg"
                    color={s?.tone === 'ok' ? c.ok : s?.tone === 'bad' ? c.bad : c.muted}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {!event.is_staff && !cancelled && !ended ? (
        <RsvpActions eventId={event.id} kids={kids} onChanged={() => void reload()} />
      ) : null}
      {event.is_staff ? (
        <View style={{ gap: space[3] }}>
          {event.type === 'game' && started && !cancelled ? (
            <Button
              title={event.outcome ? 'Edit result' : 'Enter result'}
              onPress={() => setSheet('result')}
              testID="enter-result"
            />
          ) : null}
          {!cancelled ? (
            <Button
              title="Cancel event"
              variant="ghost"
              onPress={() => setSheet('cancel')}
              testID="cancel-event"
            />
          ) : null}
          <CancelSheet
            open={sheet === 'cancel'}
            onClose={() => setSheet(null)}
            event={event}
            onDone={() => void reload()}
          />
          <ResultSheet
            open={sheet === 'result'}
            onClose={() => setSheet(null)}
            event={event}
            onDone={() => void reload()}
          />
        </View>
      ) : null}
    </AppScreen>
  );
}

function Fact({
  icon,
  text,
  sub,
  last,
}: {
  icon: 'calendar-blank' | 'map-pin' | 'flag';
  text: string;
  sub?: string | undefined;
  last?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: componentTokens.listRow.height,
        paddingVertical: space[2],
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.color.line,
      }}
    >
      <Icon name={icon} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold">{text}</Text>
        {sub ? (
          <Text variant="caption" muted>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

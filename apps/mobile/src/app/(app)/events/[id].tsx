import {
  EVENT_TYPE_LABELS,
  arriveEarlyLabel,
  describeEventTime,
  eventStateView,
  friendlyError,
  mapsUrl,
  revisionNotice,
  shouldShowRevisionNotice,
  type LastChange,
  localDateKey,
  queryRangeForDays,
  type RsvpStatus,
  mapEmbedUrl,
} from '@athleit/core';
import {
  deleteEvent,
  getEvent,
  markEventSeen,
  getHouseholdScheduleRange,
  getRsvpDetail,
  getRsvpSummary,
  type EventDetail,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Notice } from '@/components/app/kit';
import { MapEmbed } from '@/components/schedule/map-embed';
import { CountsBar } from '@/components/schedule/counts-bar';
import { CancelSheet, ResultSheet } from '@/components/schedule/event-actions';
import { EventFormSheet } from '@/components/schedule/event-form';
import { StaffRsvpPanel } from '@/components/schedule/staff-rsvp-panel';
import { RsvpActions, type ChildRsvp } from '@/components/schedule/rsvp-actions';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  useTheme,
  useToast,
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

/** Event detail (deep-link target): glass back button, kicker, title, facts card, mono counts, RSVP pills. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const c = theme.color;
  const [state, setState] = useState<Loaded | 'loading' | 'missing' | 'error'>('loading');
  const revision = useRef<number | null>(null);
  const [updated, setUpdated] = useState(false);
  const [sheet, setSheet] = useState<'cancel' | 'result' | 'edit' | 'delete' | null>(null);
  const [seenAtOpen, setSeenAtOpen] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

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
      if (typeof next !== 'string') {
        revision.current = next.event.revision;
        setSeenAtOpen(next.event.seen_revision);
        // Opening the event marks this revision as seen (clears the Updated chip on the lists).
        void markEventSeen(supabase, id);
      }
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
  const now = clock;
  const ended = new Date(event.ends_at) < now;
  const started = new Date(event.starts_at) <= now;
  const place = event.location_name ?? event.location_text;
  const mapSrc = mapEmbedUrl({
    lat: event.location_lat,
    lng: event.location_lng,
    address: event.location_address,
    name: place,
  });
  const openInMaps = mapsUrl({
    lat: event.location_lat,
    lng: event.location_lng,
    address: event.location_address,
    name: place,
    placeId: event.location_place_id,
  });
  const stateView = eventStateView(event, now, viewerZone());
  const notice =
    !cancelled &&
    (updated || shouldShowRevisionNotice({ revision: event.revision, seen_revision: seenAtOpen, starts_at: event.starts_at }, now))
      ? revisionNotice(event.last_change as LastChange | null, {
          revision: event.revision,
          starts_at: event.starts_at,
          timezone: event.timezone,
          place: place ?? null,
        })
      : null;
  const deleteBlocked = (summary ? summary.going + summary.not_going + summary.maybe > 0 : false) || event.outcome != null;

  return (
    <AppScreen>
      <View style={{ gap: space[2] }}>
        <Text variant="label" muted>
          {EVENT_TYPE_LABELS[event.type as 'game']}
        </Text>
        <Text
          variant="title"
          testID="event-title"
          style={cancelled ? { textDecorationLine: 'line-through', color: c.muted } : undefined}
        >
          {event.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={stateView.spoken}
            testID="event-state"
            style={
              stateView.tone === 'now'
                ? { paddingVertical: space[1], paddingHorizontal: space[3], borderRadius: radius.pill, backgroundColor: c.accent }
                : undefined
            }
          >
            <Text variant="monoLg" style={stateView.tone === 'now' ? { color: c.accentInk } : undefined}>
              {stateView.label}
            </Text>
          </View>
          {event.series_id ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <Icon name="repeat" size="sm" color={c.muted} />
              <Text variant="caption" muted>
                Part of a series
              </Text>
            </View>
          ) : null}
        </View>
        {t.viewerLocalLabel ? <Text muted>Your time: {t.viewerLocalLabel}</Text> : null}
      </View>

      {cancelled ? (
        <Notice tone="error" testID="cancelled-banner">
          Cancelled{event.cancelled_reason ? `: ${event.cancelled_reason}` : ''}
        </Notice>
      ) : null}
      {notice ? <Notice testID="updated-banner">Updated: {notice}.</Notice> : null}

      {mapSrc ? (
        <MapEmbed testID="event-map" src={mapSrc} label={`Map of ${place ?? 'the event location'}`} height={200} />
      ) : null}
      {openInMaps ? (
        <Button
          title={mapSrc ? 'Open in Maps' : 'Search in Maps'}
          icon={mapSrc ? 'arrow-square-out' : 'magnifying-glass'}
          variant="ghost"
          onPress={() => void Linking.openURL(openInMaps)}
        />
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
          text={`${t.dateLabel} · ${t.rangeLabel} ${t.zoneLabel}`}
          last={!place && !event.opponent_name && !event.virtual_url && !event.arrive_early_minutes}
        />
        {place ? (
          <Fact
            icon="map-pin"
            text={place}
            sub={event.location_address ?? undefined}
            last={!event.opponent_name && !event.virtual_url && !event.arrive_early_minutes}
          />
        ) : null}
        {event.type === 'game' && event.opponent_name ? (
          <Fact
            icon="flag"
            text={`vs. ${event.opponent_name}${event.home_away ? ` (${event.home_away})` : ''}`}
            last={!event.virtual_url && !event.arrive_early_minutes}
          />
        ) : null}
        {event.arrive_early_minutes ? (
          <Fact
            icon="clock"
            text={arriveEarlyLabel(event.starts_at, event.arrive_early_minutes, event.timezone)}
            last={!event.virtual_url}
          />
        ) : null}
        {event.virtual_url ? <Fact icon="link" text="Virtual · Join meeting" link={event.virtual_url} last /> : null}
      </View>
      {event.notes ? <Text>{event.notes}</Text> : null}
      {event.type === 'game' && event.outcome ? (
        <View testID="result-line" style={{ gap: space[1] }}>
          <Text variant="heading">
            {event.outcome === 'win' ? 'Won' : event.outcome === 'loss' ? 'Lost' : 'Tied'} {event.our_score}–{event.their_score}
          </Text>
          {Array.isArray(event.period_scores) && event.period_scores.length > 0 ? (
            <Text variant="mono" muted>
              {(event.period_scores as { us: number; them: number }[]).map((p) => `${p.us}–${p.them}`).join('   ')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!cancelled && summary ? <CountsBar counts={summary} /> : null}

      {event.is_staff && detail && !cancelled ? (
        <StaffRsvpPanel event={event} summary={summary} detail={detail} onChanged={() => void reload()} />
      ) : null}

      {!event.is_staff && kids.length > 0 ? (
        cancelled || ended ? (
          <Text muted testID="replies-closed">
            {cancelled ? 'This event was cancelled, so replies are closed.' : 'This event is over, so replies are closed.'}
          </Text>
        ) : (
          <RsvpActions eventId={event.id} kids={kids} onChanged={() => void reload()} />
        )
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
            <Button title="Edit" icon="pencil" variant="secondary" onPress={() => setSheet('edit')} testID="edit-event" />
          ) : null}
          {!cancelled ? (
            <Button title="Cancel event" variant="ghost" onPress={() => setSheet('cancel')} testID="cancel-event" />
          ) : null}
          <Button
            title="Delete event"
            icon="trash"
            variant="ghost"
            disabled={deleteBlocked}
            onPress={() => {
              setDeleteError(null);
              setSheet('delete');
            }}
            testID="delete-event"
          />
          {deleteBlocked ? (
            <Text variant="caption" muted testID="delete-blocked">
              {event.outcome != null ? 'A result is recorded' : 'Families have replied'}, so this can’t be deleted.
              {cancelled ? '' : ' Cancel instead.'}
            </Text>
          ) : null}
          <EventFormSheet
            open={sheet === 'edit'}
            onClose={() => setSheet(null)}
            teamId={event.team_id}
            editing={event}
            onSaved={(m) => {
              toast(m);
              void reload();
            }}
          />
          <CancelSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} event={event} onDone={() => void reload()} />
          <ResultSheet open={sheet === 'result'} onClose={() => setSheet(null)} event={event} onDone={() => void reload()} />
          <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title="Delete this event?" level="modal">
            <View style={{ gap: space[4] }}>
              <Text variant="heading">Delete this event?</Text>
              <Text muted>It is removed from the schedule and nobody is notified. This can’t be undone.</Text>
              {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
              <Button
                title="Delete event"
                onPress={async () => {
                  const res = await deleteEvent(supabase, event.id);
                  if (res.error) return setDeleteError(friendlyError(res.error));
                  setSheet(null);
                  toast('Event deleted');
                  router.back();
                }}
              />
              <Button title="Keep event" variant="ghost" onPress={() => setSheet(null)} />
            </View>
          </Sheet>
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
  link,
}: {
  icon: 'calendar-blank' | 'map-pin' | 'flag' | 'link' | 'clock';
  text: string;
  sub?: string | undefined;
  last?: boolean;
  /** Makes the row open this URL (a virtual meeting). */
  link?: string | null;
}) {
  const { theme } = useTheme();
  const Row = link ? Pressable : View;
  return (
    <Row
      {...(link
        ? {
            accessibilityRole: 'link' as const,
            accessibilityLabel: text,
            onPress: () => void Linking.openURL(link),
          }
        : {})}
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
    </Row>
  );
}

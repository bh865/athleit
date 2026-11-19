import {
  buildNextUpViews,
  eventNoun,
  hasUpdate,
  mapEmbedUrl,
  mapsUrl,
  nextUpHeadline,
  pickNextUp,
  rsvpSegments,
  type NextUpView,
} from '@athleit/core';
import { getNextUp, getTeamSchedule } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  Glass,
  Icon,
  LoadingSkeleton,
  Text,
  useTheme,
} from '@/components/ui';
import { kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useNow } from '@/lib/use-now';
import { viewerZone } from '@/lib/viewer-zone';

import { MapEmbed } from './map-embed';
import { RsvpActions } from './rsvp-actions';

const MAP_HEIGHT = 120;
const seenKey = (id: string) => `athleit.event-revision.${id}`;

/**
 * Home "Next up", the game-day card: a 120px map strip with the place pill over it, the big mono time with a
 * live relative line (Live now, then Final), and RSVP pinned at the bottom where the thumb lands. Parents get
 * Going / Can't go per child, staff the RSVP counts bar. Map: the existing MapEmbed (no new maps dependency).
 * Pass `teamId` to also see a cancelled event or a game that just ended; without it only live and upcoming show.
 */
export function NextUpCard({
  teamId = null,
  canManage = false,
}: {
  teamId?: string | null;
  canManage?: boolean;
}) {
  const now = useNow();
  const res = useLoad(async () => {
    const [next, up, past] = await Promise.all([
      getNextUp(supabase, 6),
      teamId ? getTeamSchedule(supabase, teamId, 'upcoming', 4) : Promise.resolve(null),
      teamId ? getTeamSchedule(supabase, teamId, 'past', 3) : Promise.resolve(null),
    ]);
    if (next.error) return next;
    return {
      data: buildNextUpViews(
        next.data as never,
        [...(up?.data ?? []), ...(past?.data ?? [])] as never,
        canManage,
      ),
      error: null,
    };
  }, [teamId, canManage]);
  const data = res.data;
  const view = useMemo(() => {
    const all = data ?? [];
    const pick = pickNextUp(
      all.map((v) => v.event),
      now,
    );
    return pick ? all.find((v) => v.event.eventId === pick.eventId) : undefined;
  }, [data, now]);

  if (res.loading && !res.data)
    return (
      <Card testID="next-up" accessibilityState={{ busy: true }}>
        <LoadingSkeleton rows={3} />
      </Card>
    );
  if (res.error)
    return (
      <Card testID="next-up">
        <ErrorState message="Couldn’t load what’s next." onRetry={res.reload} />
      </Card>
    );
  if (!view) return null;
  return <Game view={view} now={now} />;
}

function Game({ view, now }: { view: NextUpView; now: Date }) {
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const zone = viewerZone();
  const { event: e } = view;
  const h = nextUpHeadline(e, now, zone);
  const phase = h.phase;
  const noun = eventNoun(e.type);
  const src = mapEmbedUrl({
    lat: view.lat,
    lng: view.lng,
    address: view.address,
    name: view.place,
  });
  const openMaps = mapsUrl({
    placeId: view.placeId,
    lat: view.lat,
    lng: view.lng,
    address: view.address,
    name: view.place,
  });
  const showMap = Boolean(src) && phase !== 'final';

  // "Updated" banner: the revision moved on since this viewer last looked. First sighting stores it silently.
  const [seen, setSeen] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    kv.get(seenKey(e.eventId)).then((v) => {
      if (!live) return;
      const n = v === null ? null : Number(v);
      setSeen(n);
      if (n === null && e.revision != null) kv.set(seenKey(e.eventId), String(e.revision));
    });
    return () => {
      live = false;
    };
  }, [e.eventId, e.revision]);
  const updated = seen !== undefined && hasUpdate(e.revision, seen) && phase !== 'cancelled';

  const struck =
    phase === 'cancelled'
      ? ({ textDecorationLine: 'line-through', color: c.muted } as const)
      : undefined;
  const banner = (icon: 'info' | 'x-circle', text: string, bg: string, action?: () => void) => (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[3],
        borderRadius: radius.lg,
        backgroundColor: bg,
      }}
    >
      <Icon name={icon} weight="fill" size="sm" color={c.ink} />
      <Text variant="bodyBold" style={{ flex: 1 }}>
        {text}
      </Text>
      {action ? <Button title="Got it" variant="ghost" onPress={action} /> : null}
    </View>
  );

  return (
    <View
      testID="next-up"
      style={{
        overflow: 'hidden',
        borderRadius: radius.xl,
        borderWidth: componentTokens.card.border,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      {showMap ? (
        <View>
          <MapEmbed
            testID="next-up-map"
            src={src!}
            label={`Map of ${view.place ?? 'the event location'}`}
            height={MAP_HEIGHT}
            rounded={0}
          />
          <View style={{ position: 'absolute', left: space[3], right: space[3], bottom: space[3] }}>
            <Glass
              level="sheet"
              cornerRadius={radius.pill}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                paddingVertical: space[2],
                paddingLeft: space[4],
                paddingRight: space[2],
              }}
            >
              <Text variant="bodyBold" numberOfLines={1} style={{ flex: 1 }}>
                {view.place ?? 'Event location'}
              </Text>
              {openMaps ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${view.place ?? 'location'} in Maps`}
                  onPress={() => Linking.openURL(openMaps)}
                  style={{
                    minHeight: componentTokens.iconButton.size,
                    paddingHorizontal: space[4],
                    borderRadius: radius.pill,
                    justifyContent: 'center',
                    backgroundColor: c.accent,
                  }}
                >
                  <Text variant="bodyBold" style={{ color: c.accentInk }}>
                    Open in Maps
                  </Text>
                </Pressable>
              ) : null}
            </Glass>
          </View>
        </View>
      ) : null}
      <View style={{ gap: space[3], padding: space[4] }}>
        <Text variant="label" muted>
          NEXT UP
        </Text>
        {updated
          ? banner(
              'info',
              `This ${noun.toLowerCase()} was updated. Check the time and place.`,
              c.warnSoft,
              () => {
                setSeen(e.revision ?? 0);
                kv.set(seenKey(e.eventId), String(e.revision ?? 0));
              },
            )
          : null}
        {phase === 'cancelled'
          ? banner(
              'x-circle',
              `Cancelled${e.cancelledReason ? ` · ${e.cancelledReason}` : ''}`,
              c.badSoft,
            )
          : null}
        <View accessible accessibilityLabel={h.spoken} style={{ gap: space[1] }}>
          <Text variant="monoXl" numberOfLines={1} adjustsFontSizeToFit style={struck}>
            {h.time}
          </Text>
          {phase === 'live' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View
                style={{
                  width: componentTokens.statusDot.size,
                  height: componentTokens.statusDot.size,
                  borderRadius: radius.pill,
                  backgroundColor: c.accent,
                  borderWidth: 1,
                  borderColor: c.ink,
                }}
              />
              <Text variant="bodyBold">Live now</Text>
            </View>
          ) : phase === 'final' ? (
            <Text variant="bodyBold" muted>
              Final{h.score ? ` ${h.score}` : ''}
            </Text>
          ) : h.relative ? (
            <Text variant="bodyBold" muted>
              {h.relative}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/events/${e.eventId}` as never)}
        >
          <Text variant="heading" style={struck}>
            {e.title}
          </Text>
        </Pressable>
        {e.type === 'game' && view.homeAway ? (
          <Text variant="caption" muted>
            {view.homeAway === 'home' ? 'Home' : 'Away'}
            {view.opponent ? ` vs. ${view.opponent}` : ''}
          </Text>
        ) : null}
        {view.arriveEarly && phase === 'before' ? (
          <Text variant="caption" muted>
            Arrive {view.arriveEarly} min early
          </Text>
        ) : null}
        {phase === 'final' && h.needsResult && view.staff ? (
          <Button
            title="Enter result"
            icon="flag"
            onPress={() => router.push(`/events/${e.eventId}` as never)}
          />
        ) : null}
        {view.staff && view.counts && phase !== 'cancelled' && phase !== 'final' ? (
          <RsvpBar counts={view.counts} />
        ) : null}
        {phase !== 'cancelled' && phase !== 'final' && view.children.length > 0 ? (
          <RsvpActions eventId={e.eventId} kids={view.children} compact />
        ) : null}
      </View>
    </View>
  );
}

/** Proportional Going / Can't go / Maybe / No reply bar; every segment also carries an icon, a mono count and text. */
function RsvpBar({
  counts,
}: {
  counts: { going: number; not_going: number; maybe: number; no_reply: number };
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const segs = rsvpSegments(counts);
  const total = segs.reduce((n, s) => n + s.value, 0);
  const fill = { going: c.ok, not_going: c.bad, maybe: c.warn, no_reply: c.line } as const;
  const icon = {
    going: 'check-circle',
    not_going: 'x-circle',
    maybe: 'question',
    no_reply: 'minus-circle',
  } as const;
  return (
    <View
      accessibilityLabel={segs.map((s) => `${s.value} ${s.label}`).join(', ')}
      style={{ gap: space[2] }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: space[1],
          height: space[3],
          borderRadius: radius.pill,
          overflow: 'hidden',
          backgroundColor: c.surfaceAlt,
        }}
      >
        {total > 0
          ? segs
              .filter((s) => s.value > 0)
              .map((s) => (
                <View key={s.key} style={{ flex: s.value, backgroundColor: fill[s.key] }} />
              ))
          : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
        {segs.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Icon name={icon[s.key]} weight="fill" size="sm" color={c.ink} />
            <Text variant="mono">{s.value}</Text>
            <Text variant="caption" muted>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

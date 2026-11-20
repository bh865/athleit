import {
  attentionChip,
  friendlyError,
  type AttentionItem,
  type AttentionKind,
  type AttentionResult,
} from '@athleit/core';
import { decideJoinRequest, decidePlayerLoginClaim } from '@athleit/db/api';
import { setRsvp } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Button, Card, ErrorState, Icon, LoadingSkeleton, Text, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { viewerZone } from '@/lib/viewer-zone';

const ICON: Record<AttentionKind, IconName> = {
  rsvp: 'question',
  result: 'flag',
  payment: 'credit-card',
  waiver: 'warning',
  registrationStep: 'receipt',
  joinRequests: 'users-three',
  loginClaims: 'user',
  linkRequests: 'link',
  registrationsToDecide: 'clipboard-text',
  payouts: 'bank',
  billing: 'credit-card',
  setup: 'list-checks',
};

/** Trailing control(s) for one row: resolve in place where an action exists, else deep-link. */
function Actions({
  item,
  primary,
  onResolved,
}: {
  item: AttentionItem;
  primary: boolean;
  onResolved: (key: string) => void;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = item.action;

  async function run(job: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError(null);
    const res = await job();
    setBusy(false);
    if (res.error) setError(friendlyError(res.error as never));
    else onResolved(item.key);
  }
  const err = error ? (
    <Text variant="caption" accessibilityRole="alert" style={{ color: theme.color.bad }}>
      {error}
    </Text>
  ) : null;

  if (a?.type === 'rsvp')
    return (
      <View style={{ alignItems: 'flex-end', gap: space[1] }}>
        <Button
          title="Going"
          variant={primary ? 'primary' : 'secondary'}
          loading={busy}
          accessibilityLabel={`${a.firstName}: Going`}
          onPress={() => run(() => setRsvp(supabase, a.eventId, a.playerId, 'going'))}
        />
        {err}
      </View>
    );
  if (a?.type === 'decide') {
    const decide = (approve: boolean) =>
      run(() =>
        a.what === 'join'
          ? decideJoinRequest(supabase, a.id, approve)
          : decidePlayerLoginClaim(supabase, a.id, approve),
      );
    return (
      <View style={{ gap: space[1] }}>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button
            title="Approve"
            variant={primary ? 'primary' : 'secondary'}
            loading={busy}
            onPress={() => decide(true)}
          />
          <Button title="Decline" variant="ghost" loading={busy} onPress={() => decide(false)} />
        </View>
        {err}
      </View>
    );
  }
  // Link-only items have no trailing control: the title (and the card) open the screen.
  return null;
}

/** Time-pressure chip: icon and words together, never colour alone. */
function Chip({ item, now }: { item: AttentionItem; now: Date }) {
  const { theme } = useTheme();
  const c = theme.color;
  const chip = attentionChip(item, now, viewerZone());
  if (!chip) return null;
  const tone =
    chip.tone === 'urgent'
      ? { bg: c.badSoft, fg: c.bad }
      : chip.tone === 'soon'
        ? { bg: c.warnSoft, fg: c.warn }
        : { bg: c.surfaceAlt, fg: c.ink };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space[2],
        paddingVertical: space[1],
        paddingHorizontal: space[3],
        borderRadius: radius.pill,
        backgroundColor: tone.bg,
      }}
    >
      <Icon name={chip.icon} weight="fill" size="sm" color={tone.fg} />
      <Text variant="bodyBold" style={{ color: tone.fg }}>
        {chip.text}
      </Text>
    </View>
  );
}

/** One condensed card in the swiper: icon and time chip, a two-line title, place and detail, then the action. */
function Slide({
  item,
  now,
  lead,
  width,
  index,
  total,
  onResolved,
}: {
  item: AttentionItem;
  now: Date;
  lead: boolean;
  width: number;
  index: number;
  total: number;
  onResolved: (key: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const size = componentTokens.avatar.md;
  const meta = [item.placeTag, item.detail].filter(Boolean).join(' · ');
  return (
    <Card
      testID="attention-row"
      accessibilityLabel={`${index + 1} of ${total}`}
      style={{ width, padding: space[4], gap: space[2], justifyContent: 'space-between' }}
    >
      <View style={{ gap: space[2] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space[2],
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.surfaceAlt,
            }}
          >
            <Icon name={ICON[item.kind]} weight={lead ? 'fill' : 'regular'} color={c.ink} />
          </View>
          <Chip item={item} now={now} />
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
          onPress={() => router.push(item.href as never)}
        >
          <Text variant="bodyBold" numberOfLines={2}>
            {item.label}
          </Text>
        </Pressable>
        {meta ? (
          <Text variant="caption" muted numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Actions item={item} primary={lead} onResolved={onResolved} />
    </Card>
  );
}

/**
 * "Needs your attention", a swiper of condensed cards that bleeds to the screen edges, the first card
 * carrying the lime action. One merged list for dual roles (place tags).
 * States: loading skeleton, error with retry, and a quiet "all caught up" line.
 */
export function AttentionStrip({
  attention,
  loading,
  error,
  onRetry,
  onResolved,
  now,
}: {
  attention: AttentionResult;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onResolved: () => void;
  now: Date;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const { width } = useWindowDimensions();
  const [settled, setSettled] = useState<{ keys: ReadonlySet<string>; of: AttentionResult }>({
    keys: new Set(),
    of: attention,
  });
  // Only valid for the list it was recorded against: a refetch yields a new list, so a later item with the same key shows.
  const done: ReadonlySet<string> = settled.of === attention ? settled.keys : new Set();
  const settle = (key: string) => {
    setSettled({ keys: new Set(done).add(key), of: attention });
    onResolved();
  };
  const shown = attention.shown.filter((i) => !done.has(i.key));
  const more = attention.more.filter((i) => !done.has(i.key));
  const all = [...shown, ...more];
  const total = all.length;
  // About 80% of the screen so the next card peeks in, capped for tablets.
  const cardWidth = Math.min(width * 0.8, 340);

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Text variant="label" muted accessibilityRole="header">
        NEEDS YOUR ATTENTION
      </Text>
      {total > 0 ? (
        <View
          accessibilityLabel={`${total} need you`}
          style={{
            minWidth: componentTokens.badge.minWidth,
            height: componentTokens.badge.height,
            paddingHorizontal: space[2],
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accent,
          }}
        >
          <Text variant="mono" style={{ color: c.accentInk }}>
            {total}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: space[3] }} testID="home-attention" accessibilityLiveRegion="polite">
      {head}
      {total === 0 && loading ? (
        <Card>
          <LoadingSkeleton rows={3} />
        </Card>
      ) : total === 0 && error ? (
        <Card>
          <ErrorState message="Couldn’t load what needs you." onRetry={onRetry} />
        </Card>
      ) : total === 0 ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
          testID="home-caught-up"
        >
          <Icon name="check-circle" weight="fill" color={c.muted} />
          <Text variant="bodyBold" muted>
            You’re all caught up
          </Text>
        </View>
      ) : (
        <>
          {/* Bleeds to both screen edges: negative margin out of the screen padding, added back as content padding. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={cardWidth + space[3]}
            snapToAlignment="start"
            accessibilityRole="list"
            accessibilityLabel="Needs your attention"
            style={{ marginHorizontal: -space[4] }}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
          >
            {all.map((i, n) => (
              <Slide
                key={i.key}
                item={i}
                now={now}
                lead={n === 0}
                width={cardWidth}
                index={n}
                total={all.length}
                onResolved={settle}
              />
            ))}
          </ScrollView>
          {error ? (
            <Text variant="caption" muted>
              Some items didn’t load.{' '}
              <Text variant="bodyBold" onPress={onRetry} accessibilityRole="button">
                Retry
              </Text>
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

import {
  attentionActionLabel,
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
import { Pressable, View } from 'react-native';

import {
  Button,
  Card,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  useTheme,
} from '@/components/ui';
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
  const router = useRouter();
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
  return (
    <Button
      title={attentionActionLabel(item)}
      variant={primary ? 'primary' : 'secondary'}
      onPress={() => router.push(item.href as never)}
    />
  );
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

function Row({
  item,
  now,
  lead,
  onResolved,
}: {
  item: AttentionItem;
  now: Date;
  lead?: boolean;
  onResolved: (key: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const router = useRouter();
  const size = componentTokens.avatar.md;
  return (
    <View
      testID="attention-row"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space[3],
        minHeight: componentTokens.listRow.height,
        paddingVertical: space[2],
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
      <View style={{ flex: 1, minWidth: 140, gap: space[1] }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
          onPress={() => router.push(item.href as never)}
          style={{ minHeight: componentTokens.iconButton.size / 2, justifyContent: 'center' }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] }}
          >
            <Text variant="bodyBold">{item.label}</Text>
            {item.placeTag ? (
              <View
                style={{
                  paddingHorizontal: space[2],
                  borderRadius: radius.pill,
                  backgroundColor: c.surfaceAlt,
                }}
              >
                <Text variant="label" muted>
                  {item.placeTag}
                </Text>
              </View>
            ) : null}
          </View>
          {item.detail ? (
            <Text variant="caption" muted>
              {item.detail}
            </Text>
          ) : null}
        </Pressable>
        <Chip item={item} now={now} />
      </View>
      <Actions item={item} primary={Boolean(lead)} onResolved={onResolved} />
    </View>
  );
}

/**
 * "Needs your attention", compact triage list: every item and its action visible without swiping, the lead row
 * carrying the lime action. At most 4 rows then "+N more" in a Sheet. One merged list for dual roles (place tags).
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
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const settle = (key: string) => {
    setDone((d) => new Set(d).add(key));
    onResolved();
  };
  const shown = attention.shown.filter((i) => !done.has(i.key));
  const more = attention.more.filter((i) => !done.has(i.key));
  const total = shown.length + more.length;

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
        <Card style={{ gap: space[1] }}>
          {shown.map((i, n) => (
            <View
              key={i.key}
              style={n > 0 ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}
            >
              <Row item={i} now={now} lead={n === 0} onResolved={settle} />
            </View>
          ))}
          {more.length > 0 ? (
            <Button title={`+${more.length} more`} variant="ghost" onPress={() => setOpen(true)} />
          ) : null}
          {error ? (
            <Text variant="caption" muted>
              Some items didn’t load.{' '}
              <Text variant="bodyBold" onPress={onRetry} accessibilityRole="button">
                Retry
              </Text>
            </Text>
          ) : null}
        </Card>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Needs your attention">
        <View style={{ gap: space[1] }}>
          {[...shown, ...more].map((i) => (
            <Row key={i.key} item={i} now={now} onResolved={settle} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

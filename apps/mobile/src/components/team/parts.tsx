import { pageOf, teamTabParams, type TeamAttentionRow, type TeamTab } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconCircle,
  LoadingSkeleton,
  Sheet,
  Text,
  TextField,
  useTheme,
} from '@/components/ui';

export {
  agoLabel as ago,
  matchesQuery as matches,
  shortDateLabel as shortDate,
} from '@athleit/core';

/** Number + label tile (Waivers, Registrations). The label always says what the number is. */
export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'bad' | 'warn' | 'ok';
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const color = tone === 'bad' ? c.bad : tone === 'warn' ? c.warn : tone === 'ok' ? c.ok : c.ink;
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        padding: space[4],
        gap: space[1],
        borderRadius: componentTokens.card.radius,
        borderWidth: componentTokens.card.border,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="monoLg" style={{ color }}>
        {value}
      </Text>
      {note ? (
        <Text variant="caption" muted>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>{children}</View>;
}

const ATTENTION_ICON: Record<TeamAttentionRow['kind'], IconName> = {
  joinRequests: 'user-plus',
  waivers: 'shield-warning',
  registrations: 'clipboard-text',
  payments: 'credit-card',
};

/** One "Needs attention" row: icon, label, first names, count, caret. 44px+ target. */
export function AttentionRow({ row, onOpen }: { row: TeamAttentionRow; onOpen: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${row.count}${row.detail ? `, ${row.detail}` : ''}`}
      onPress={onOpen}
      style={{
        minHeight: componentTokens.listRow.height,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[2],
      }}
    >
      <IconCircle>
        <Icon name={ATTENTION_ICON[row.kind]} />
      </IconCircle>
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold">{row.label}</Text>
        {row.detail ? (
          <Text variant="caption" muted numberOfLines={1}>
            {row.detail}
          </Text>
        ) : null}
      </View>
      <Badge tone="count">{String(row.count)}</Badge>
      <Icon name="caret-right" size="sm" color={theme.color.muted} />
    </Pressable>
  );
}

/** Skeleton rows shaped like loaded rows (avatar and two lines). */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  const { theme } = useTheme();
  const bar = (w: `${number}%`, o = 1) => (
    <View
      style={{
        height: space[3],
        width: w,
        borderRadius: radius.pill,
        backgroundColor: theme.color.surfaceAlt,
        opacity: o,
      }}
    />
  );
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: space[3] }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View
            style={{
              width: componentTokens.avatar.md,
              height: componentTokens.avatar.md,
              borderRadius: radius.pill,
              backgroundColor: theme.color.surfaceAlt,
            }}
          />
          <View style={{ flex: 1, gap: space[2] }}>
            {bar('55%')}
            {bar('75%', 0.7)}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Loading skeleton, empty (icon, one sentence, one primary action), error with "Try again", or the list. */
export function ListState({
  name,
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  name: string;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  empty?: { when: boolean; icon: IconName; text: string; action?: ReactNode } | undefined;
  children: ReactNode;
}) {
  if (loading) return <RowsSkeleton />;
  if (error)
    return (
      <ErrorState
        message={`Can’t load ${name}. Check your connection and try again.`}
        onRetry={onRetry}
      />
    );
  if (empty?.when) return <EmptyState icon={empty.icon} title={empty.text} action={empty.action} />;
  return <>{children}</>;
}

export { LoadingSkeleton };

/** Client-side paging, 25 at a time. The count resets whenever the filter or search changes. */
export function useShowMore<T>(items: readonly T[], resetKey: string) {
  const [state, setState] = useState({ key: resetKey, shown: 25 });
  const shown = state.key === resetKey ? state.shown : 25;
  const page = pageOf(items, shown);
  return { ...page, more: () => setState({ key: resetKey, shown: shown + 25 }) };
}

export function ShowMore({
  total,
  shown,
  remaining,
  onMore,
}: {
  total: number;
  shown: number;
  remaining: number;
  onMore: () => void;
}) {
  if (total <= 25) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="monoSm" muted>
        1–{shown} of {total}
      </Text>
      {remaining > 0 ? <Button title="Show more" variant="secondary" onPress={onMore} /> : null}
    </View>
  );
}

export function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
    />
  );
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} level="modal">
      <Text variant="heading">{title}</Text>
      <Text muted>{body}</Text>
      <Button title={confirmLabel} loading={busy ?? false} onPress={onConfirm} />
      <Button title="Cancel" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

/**
 * Same pills as the web tab row, in the same order. Scrolls sideways and keeps the active pill centered.
 * Tabs with pending work carry a count badge.
 */
export function TabPills({
  tabs,
  active,
  counts,
  labels,
  onPick,
}: {
  tabs: readonly TeamTab[];
  active: TeamTab;
  counts: Partial<Record<TeamTab, number>>;
  labels: Record<TeamTab, string>;
  onPick: (t: TeamTab) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const [spots, setSpots] = useState<Record<string, { x: number; w: number }>>({});
  const spot = spots[active];
  const spotX = spot?.x;
  const spotW = spot?.w;
  // Keep the active pill centered whenever it, or the measurements, change.
  useEffect(() => {
    if (spotX === undefined || spotW === undefined || !width) return;
    scroller.current?.scrollTo({ x: Math.max(0, spotX + spotW / 2 - width / 2), animated: true });
  }, [spotX, spotW, width]);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      // A horizontal ScrollView grows to fill spare height by default; keep the pills at their own height.
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: space[2], paddingVertical: space[1] }}
    >
      {tabs.map((t) => {
        const on = t === active;
        const n = counts[t] ?? 0;
        return (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={n > 0 ? `${labels[t]}, ${n} pending` : labels[t]}
            onLayout={(e) => {
              const { x, width: w } = e.nativeEvent.layout;
              setSpots((p) => (p[t]?.x === x && p[t]?.w === w ? p : { ...p, [t]: { x, w } }));
            }}
            onPress={() => onPick(t)}
            style={{
              minHeight: componentTokens.minTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[2],
              paddingHorizontal: space[4],
              borderRadius: radius.pill,
              backgroundColor: on ? c.bubbleOwn : c.surfaceAlt,
            }}
          >
            <Text variant="caption" style={{ color: on ? c.bubbleOwnInk : c.ink }}>
              {labels[t]}
            </Text>
            {n > 0 ? <Badge tone="count">{String(n)}</Badge> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export { teamTabParams };

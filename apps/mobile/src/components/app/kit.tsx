import { minTarget, radii, spacing } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { Button, Text, useTheme } from '@/components/ui';

export function H1({ children }: { children: ReactNode }) {
  return (
    <Text size="2xl" weight="bold" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <Text size="lg" weight="semibold" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Notice({
  tone = 'neutral',
  children,
  testID,
}: {
  tone?: 'neutral' | 'error' | 'success';
  children: ReactNode;
  testID?: string;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const palette =
    tone === 'error'
      ? { bg: c.danger.bg, fg: c.danger.text }
      : tone === 'success'
        ? { bg: c.success.bg, fg: c.success.text }
        : { bg: c.surfaceMuted, fg: c.text };
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{ padding: spacing[3], borderRadius: radii.md, backgroundColor: palette.bg }}
    >
      <Text size="sm" style={{ color: palette.fg }}>
        {children}
      </Text>
    </View>
  );
}

export function FormMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (success) return <Notice tone="success">{success}</Notice>;
  return null;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const p =
    tone === 'neutral' ? { bg: c.surfaceMuted, fg: c.text } : { bg: c[tone].bg, fg: c[tone].text };
  return (
    <View
      style={{
        paddingHorizontal: spacing[2],
        paddingVertical: 2,
        borderRadius: radii.full,
        backgroundColor: p.bg,
      }}
    >
      <Text size="xs" weight="semibold" style={{ color: p.fg }}>
        {children}
      </Text>
    </View>
  );
}

/** A row in a list: title, optional subtitle, optional trailing content. Tap target >= 56pt. */
export function ListItem({
  title,
  subtitle,
  right,
  onPress,
  selected,
  testID,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  testID?: string;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="semibold">{title}</Text>
        {subtitle ? (
          <Text size="sm" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </>
  );
  const style: ViewStyle = {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.md,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? c.focusRing : c.border,
    backgroundColor: c.surface,
  };
  return onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { backgroundColor: c.surfaceMuted }]}
    >
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

/** Radio-style chips: the mobile equivalent of a <select> for short lists. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View style={{ gap: spacing[2] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text size="sm" weight="semibold">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={{
                minHeight: minTarget,
                justifyContent: 'center',
                paddingHorizontal: spacing[4],
                borderRadius: radii.full,
                borderWidth: on ? 2 : 1,
                borderColor: on ? c.focusRing : c.borderStrong,
                backgroundColor: on ? c.accent : c.surface,
              }}
            >
              <Text weight="semibold" style={{ color: on ? c.onAccent : c.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Segmented tabs for the sections of a team. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing[1],
        borderBottomWidth: 1,
        borderColor: c.border,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              minHeight: minTarget,
              justifyContent: 'center',
              paddingHorizontal: spacing[3],
              borderBottomWidth: 3,
              borderBottomColor: on ? c.accentInk : 'transparent',
            }}
          >
            <Text weight="semibold" muted={!on}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Loading / error / empty states for every list. */
export function LoadState({
  loading,
  error,
  empty,
  emptyText,
  emptyAction,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean | undefined;
  emptyText?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        style={{ padding: spacing[4] }}
      >
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ gap: spacing[3] }}>
        <Notice tone="error">{error}</Notice>
        {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={{ gap: spacing[3] }}>
        <Notice>{emptyText ?? 'Nothing here yet.'}</Notice>
        {emptyAction}
      </View>
    );
  }
  return <>{children}</>;
}

/** Back link for stack screens. */
export function BackLink({ label = 'Back' }: { label?: string }) {
  const router = useRouter();
  return (
    <Button
      title={`← ${label}`}
      variant="ghost"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}

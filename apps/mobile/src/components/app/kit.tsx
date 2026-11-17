import { radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Heading,
  ListRow,
  LoadingSkeleton,
  Text,
  useTheme,
} from '@/components/ui';

export { Badge };

export function H1({ children }: { children: ReactNode }) {
  return <Heading level="title">{children}</Heading>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Heading level="heading">{children}</Heading>;
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
      ? { bg: c.badSoft, fg: c.bad }
      : tone === 'success'
        ? { bg: c.okSoft, fg: c.ok }
        : { bg: c.surfaceAlt, fg: c.ink };
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{ padding: space[3], borderRadius: radius.sm, backgroundColor: palette.bg }}
    >
      <Text variant="caption" style={{ color: palette.fg }}>
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

/** A list row (put several inside a `ListGroup`). Pass `avatarName` for people. */
export function ListItem({
  title,
  subtitle,
  right,
  onPress,
  selected,
  avatarName,
  testID,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  avatarName?: string;
  testID?: string;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      trailing={right}
      selected={selected}
      leading={avatarName ? <Avatar name={avatarName} /> : undefined}
      {...(onPress ? { onPress } : null)}
      {...(testID ? { testID } : null)}
    />
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
  return (
    <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="caption">{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={o.value === value}
            accessibilityRole="radio"
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Section switcher for a team: chips, selected = "sent" fill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === value}
          accessibilityRole="radio"
          onPress={() => onChange(o.value)}
        />
      ))}
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
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyText ?? 'Nothing here yet.'} action={emptyAction} />;
  return <>{children}</>;
}

/** Back link for stack screens. */
export function BackLink({ label = 'Back' }: { label?: string }) {
  const router = useRouter();
  return (
    <Button
      title={label}
      icon="caret-left"
      variant="ghost"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}

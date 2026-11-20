import { jerseyDigits, jerseySpoken, statusLabel, type RosterStatus } from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Icon, Text, TextField, useTheme } from '@/components/ui';

/** Status is icon plus word, never colour alone: "Active" / "Inactive". */
export function StatusMark({ status }: { status: RosterStatus }) {
  const { theme } = useTheme();
  const active = status === 'active';
  const color = active ? theme.color.ok : theme.color.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      <Icon name={active ? 'check-circle' : 'minus-circle'} size="sm" color={color} />
      <Text variant="caption" style={{ color }}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

/** Mono jersey number; screen readers hear "number 7" / "no number". */
export function Jersey({
  value,
  variant = 'monoLg',
  muted,
}: {
  value: number | null | undefined;
  variant?: 'mono' | 'monoLg' | 'monoXl';
  muted?: boolean;
}) {
  return (
    <Text
      variant={variant}
      {...(muted ? { muted: true } : null)}
      accessibilityLabel={jerseySpoken(value)}
    >
      {jerseyDigits(value)}
    </Text>
  );
}

/** 44px choice chip (the shared Chip is 32 high, below the minimum target). */
export function PickChip({
  label,
  selected,
  onPress,
  accessibilityRole = 'radio',
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityRole?: 'radio' | 'button';
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      onPress={onPress}
      style={{
        minHeight: componentTokens.minTarget,
        minWidth: componentTokens.minTarget,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: space[4],
        borderRadius: radius.pill,
        backgroundColor: selected ? c.bubbleOwn : c.surfaceAlt,
      }}
    >
      <Text variant="caption" style={{ color: selected ? c.bubbleOwnInk : c.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Quick-picks from the sport config fill the free-text field; the text stays the source of truth. */
export function PositionPicker({
  options,
  value,
  onChange,
  error,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="caption">Position</Text>
      {options.length > 0 && (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Position quick picks"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
        >
          {options.map((p) => (
            <PickChip
              key={p}
              label={p}
              selected={value.trim() === p}
              onPress={() => onChange(value.trim() === p ? '' : p)}
            />
          ))}
        </View>
      )}
      <TextField
        label="Other position"
        value={value}
        onChangeText={onChange}
        error={error}
        maxLength={40}
      />
    </View>
  );
}

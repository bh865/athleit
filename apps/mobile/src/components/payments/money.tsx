import { formatCents, spokenCents } from '@athleit/core';

import { Text } from '@/components/ui';

/** Every amount is mono; the accessibility label is spoken ("45 dollars"). */
export function Amount({
  cents,
  variant = 'mono',
  label,
}: {
  cents: number;
  variant?: 'mono' | 'monoLg' | 'monoXl' | 'monoSm';
  label?: string;
}) {
  return (
    <Text
      variant={variant}
      accessibilityLabel={`${label ? `${label}, ` : ''}${spokenCents(cents)}`}
    >
      {formatCents(cents)}
    </Text>
  );
}

export const dueText = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

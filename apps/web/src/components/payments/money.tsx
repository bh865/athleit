import { formatCents, spokenCents } from '@athleit/core';

import { Mono, Text } from '@/components/ui';

/** Every amount is mono. The accessible name is spoken ("45 dollars"), never "dollar sign four five". */
export function Amount({
  cents,
  variant = 'mono',
  label,
}: {
  cents: number;
  variant?: 'mono' | 'monoLg' | 'monoXl' | 'monoSm';
  /** Prefix for the spoken form, e.g. "Jersey fee". */
  label?: string;
}) {
  const spoken = `${label ? `${label}, ` : ''}${spokenCents(cents)}`;
  if (variant === 'mono') return <Mono aria-label={spoken}>{formatCents(cents)}</Mono>;
  return (
    <Text variant={variant} aria-label={spoken}>
      {formatCents(cents)}
    </Text>
  );
}

export const dueText = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Jersey fee, 45 dollars, due November 30, unpaid" for screen readers. */
export function requestSummaryLabel(a: {
  title: string;
  cents: number;
  dueAt: string;
  status: string;
}) {
  const due = new Date(a.dueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${a.title}, ${spokenCents(a.cents)}, due ${due}, ${a.status}`;
}

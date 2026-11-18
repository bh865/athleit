import { Icon } from '@/components/ui';

import styles from './payments.module.css';

export type PillTone = 'neutral' | 'ok' | 'warn' | 'bad';
const toneClass: Record<PillTone, string> = {
  neutral: styles.toneNeutral!,
  ok: styles.toneOk!,
  warn: styles.toneWarn!,
  bad: styles.toneBad!,
};

/** Soft status pill with a filled icon: Open, Due in N days, Overdue, Closed, Unpaid, Paid, Waived. */
export function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: PillTone;
  icon: Parameters<typeof Icon>[0]['name'];
  children: React.ReactNode;
}) {
  return (
    <span className={`${styles.statusPill} ${toneClass[tone]}`}>
      <Icon name={icon} weight="fill" size="sm" />
      {children}
    </span>
  );
}

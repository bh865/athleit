import type { IconName } from '@athleit/ui-core';
import type { ReactNode } from 'react';

import { Button } from './button';
import { Icon } from './icon';
import styles from './states.module.css';
import { Text } from './text';

/** 88px icon circle, title, one line of body text, at most one action. */
export function EmptyState({
  icon = 'tray',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.state} data-testid="empty-state">
      <span className={styles.circle}>
        <Icon name={icon} size="xl" />
      </span>
      <Text variant="heading" as="p">
        {title}
      </Text>
      {body ? (
        <Text muted as="p">
          {body}
        </Text>
      ) : null}
      {action}
    </div>
  );
}

/** Icon, plain message, "Try again". */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className={styles.state} role="alert">
      <span className={`${styles.circle} ${styles.bad}`}>
        <Icon name="warning-circle" size="xl" />
      </span>
      <Text variant="bodyBold" as="p">
        {message}
      </Text>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Skeleton rows while loading. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={styles.row} />
      ))}
    </div>
  );
}

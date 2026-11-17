import type { ReactNode } from 'react';

import { Button } from '@/components/ui';

import styles from './app.module.css';

/** Loading / error / empty states for every list, so no screen is ever blank or stuck. */
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
  empty?: boolean;
  emptyText?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <p className={styles.muted} role="status" aria-live="polite">
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <div className={`${styles.notice} ${styles.error} ${styles.stack}`} role="alert">
        <span>{error}</span>
        {onRetry && (
          <div>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className={`${styles.notice} ${styles.stack}`}>
        <span>{emptyText ?? 'Nothing here yet.'}</span>
        {emptyAction}
      </div>
    );
  }
  return <>{children}</>;
}

export function FormMessage({
  error,
  success,
}: {
  error?: string | null | undefined;
  success?: string | null | undefined;
}) {
  if (error)
    return (
      <p role="alert" className={`${styles.notice} ${styles.error}`}>
        {error}
      </p>
    );
  if (success)
    return (
      <p role="status" className={`${styles.notice} ${styles.success}`}>
        {success}
      </p>
    );
  return null;
}

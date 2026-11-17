import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui';

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
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyText ?? 'Nothing here yet.'} action={emptyAction} />;
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

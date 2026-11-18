'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { Card, ErrorState, LoadingSkeleton, Text } from '@/components/ui';

import styles from './home.module.css';

interface LoadResult {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Shared frame for a Home tile: skeleton while loading, a retryable error, and nothing at all when the tile
 * has nothing to say (`empty`). One tile failing never blanks the page.
 */
export function TileShell({
  id,
  title,
  href,
  linkLabel = 'Open',
  res,
  empty,
  hasData,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
  res: LoadResult;
  /** True when there is nothing to show: the tile hides. */
  empty: boolean;
  /** True once data has loaded at least once. */
  hasData: boolean;
  children: ReactNode;
}) {
  if (res.error) {
    return (
      <Card className={styles.card} data-testid={id}>
        <Text variant="bodyBold">{title}</Text>
        <ErrorState message="Couldn’t load this." onRetry={res.reload} />
      </Card>
    );
  }
  if (res.loading && !hasData) {
    return (
      <Card className={styles.card} data-testid={id} aria-busy>
        <Text variant="bodyBold">{title}</Text>
        <LoadingSkeleton rows={2} />
      </Card>
    );
  }
  if (empty) return null;
  return (
    <Card className={styles.card} data-testid={id}>
      <div className={styles.cardHead}>
        <Text variant="bodyBold" as="h2">
          {title}
        </Text>
        {href ? (
          <Link href={href} className={styles.cardLink}>
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

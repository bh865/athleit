'use client';

import type { ReactNode } from 'react';

import { ErrorState, LoadingSkeleton } from '@/components/ui';

import { useApp } from './app-provider';
import styles from './app.module.css';
import shell from './shell.module.css';
import { LiveNotifications } from '@/components/notifications/live-notifications';
import { Sidebar } from './sidebar';

export function Shell({ children }: { children: ReactNode }) {
  const { status } = useApp();
  return (
    <div className={shell.layout}>
      <Sidebar />
      {status === 'ready' && <LiveNotifications />}
      <div className={shell.content}>
        <main className={styles.column} data-testid="app-main">
          {status === 'loading' && <LoadingSkeleton />}
          {status === 'error' && (
            <ErrorState message="We couldn’t load your account. Refresh the page to try again." />
          )}
          {status === 'ready' && children}
        </main>
      </div>
    </div>
  );
}

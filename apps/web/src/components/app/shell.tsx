'use client';

import { APP_NAME } from '@athleit/core';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { signOut } from '@/app/(auth)/actions';
import { Button, GlassBar, ThemeToggle } from '@/components/ui';

import { useApp } from './app-provider';
import styles from './app.module.css';
import { ContextSwitcher } from './context-switcher';
import shell from './shell.module.css';

export function Shell({ children }: { children: ReactNode }) {
  const { status, displayName } = useApp();
  return (
    <div className={styles.page}>
      <GlassBar level="bar" className={shell.bar}>
        <Link href="/" className={shell.brand}>
          {APP_NAME}
        </Link>
        <div className={shell.switcher}>{status === 'ready' && <ContextSwitcher />}</div>
        <ThemeToggle />
        <form action={signOut}>
          <Button type="submit" variant="ghost" aria-label={`Sign out ${displayName ?? ''}`.trim()}>
            Sign out
          </Button>
        </form>
      </GlassBar>
      <main className={styles.column} data-testid="app-main">
        {status === 'loading' && (
          <p className={styles.muted} role="status">
            Loading…
          </p>
        )}
        {status === 'error' && (
          <p className={`${styles.notice} ${styles.error}`} role="alert">
            We couldn’t load your account. Refresh the page to try again.
          </p>
        )}
        {status === 'ready' && children}
      </main>
    </div>
  );
}

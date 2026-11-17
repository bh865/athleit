'use client';

import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getUnreadTotal, subscribeToNotifications } from '@athleit/db/api';

import { signOut } from '@/app/(auth)/actions';
import { Badge, Button, Glass, Icon, Logo, ThemeToggle } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { useApp } from './app-provider';
import { ContextSwitcher } from './context-switcher';
import styles from './sidebar.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
}

/** Glass sidebar: 248 wide on desktop; collapses to a top bar on narrow screens. */
export function Sidebar() {
  const { status, contexts, displayName, userId } = useApp();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const hasTeam = contexts.some((c) => c.kind === 'team');

  // Live unread badge for Messages.
  useEffect(() => {
    if (!userId || !hasTeam) return;
    const client = getClient();
    const refresh = () =>
      void getUnreadTotal(client).then((r) => r.data !== null && setUnread(r.data));
    refresh();
    return subscribeToNotifications(client, userId, refresh);
  }, [userId, hasTeam]);
  const hasFamily = contexts.some((c) => c.kind === 'family');
  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: 'house' },
    ...(hasTeam
      ? [
          {
            href: '/messages',
            label: 'Messages',
            icon: 'chat-circle',
            ...(unread > 0 ? { badge: unread > 99 ? '99+' : String(unread) } : {}),
          } as NavItem,
        ]
      : []),
    ...(contexts.length > 0
      ? [{ href: '/schedule', label: 'Schedule', icon: 'calendar-blank' } as NavItem]
      : []),
    { href: '/notifications', label: 'Alerts', icon: 'bell' },
    ...(hasFamily ? [{ href: '/family', label: 'Family', icon: 'house-line' } as NavItem] : []),
  ];
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Glass as="aside" level="bar" className={styles.sidebar} aria-label="Main">
      <Link href="/" className={styles.brand} aria-label="Athleit home">
        <Logo variant="lockup" size="md" />
      </Link>
      <div className={styles.switcher}>{status === 'ready' && <ContextSwitcher />}</div>
      <nav className={styles.nav} aria-label="Primary">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`${styles.item} ${isActive(i.href) ? styles.active : ''}`}
            aria-current={isActive(i.href) ? 'page' : undefined}
          >
            <Icon name={i.icon} weight={isActive(i.href) ? 'fill' : 'regular'} size="lg" />
            <span className={styles.label}>{i.label}</span>
            {i.badge ? <Badge tone="count">{i.badge}</Badge> : null}
          </Link>
        ))}
      </nav>
      <div className={styles.footer}>
        <ThemeToggle />
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            fullWidth
            aria-label={`Sign out ${displayName ?? ''}`.trim()}
          >
            <Icon name="sign-out" size="sm" /> Sign out
          </Button>
        </form>
      </div>
    </Glass>
  );
}

'use client';

import { capabilitiesForPlace, payViewsFor } from '@athleit/core';
import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getUnreadTotal, subscribeToNotifications } from '@athleit/db/api';

import { Badge, Glass, Icon, IconButton, Logo } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { AccountChip } from './account-chip';
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
  const { status, contexts, active, userId } = useApp();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  // Open for one path only: navigating closes the drawer without a setState-in-effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenAt((cur) => ((typeof v === 'function' ? v(cur === pathname) : v) ? pathname : null));

  // Narrow screens: the sidebar is a drawer; close it after navigating or on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
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
  const pv = payViewsFor(contexts, null);
  const showPay = pv.payer;
  // Team details (members, invites, settings...) are staff only; the active team decides which one.
  const settingsHref =
    active?.kind === 'team' && capabilitiesForPlace(contexts, 'team', active.id).has('team.details')
      ? `/teams/${active.id}`
      : null;
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
    ...(hasTeam ? [{ href: '/roster', label: 'Roster', icon: 'users-three' } as NavItem] : []),
    ...(contexts.length > 0
      ? [{ href: '/schedule', label: 'Schedule', icon: 'calendar-blank' } as NavItem]
      : []),
    ...(showPay ? [{ href: '/pay', label: 'Pay', icon: 'credit-card' } as NavItem] : []),
    ...(hasFamily
      ? [{ href: '/registrations', label: 'Registrations', icon: 'clipboard-text' } as NavItem]
      : []),
    { href: '/notifications', label: 'Alerts', icon: 'bell' },
    ...(hasFamily ? [{ href: '/family', label: 'Family', icon: 'house-line' } as NavItem] : []),
    ...(settingsHref ? [{ href: settingsHref, label: 'Settings', icon: 'gear' } as NavItem] : []),
  ];
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Athleit home">
          <Logo variant="lockup" size="md" />
        </Link>
        <div className={styles.topbarActions}>
          {status === 'ready' ? <AccountChip variant="avatar" /> : null}
          <IconButton
            icon={open ? 'x' : 'list'}
            label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="app-nav"
            onClick={() => setOpen((o) => !o)}
          />
        </div>
      </div>
      {open ? <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden /> : null}
      <Glass
        as="aside"
        level="bar"
        id="app-nav"
        data-open={open ? 'true' : 'false'}
        className={styles.sidebar}
        aria-label="Main"
      >
        <Link
          href="/"
          className={`${styles.brand} ${styles.drawerBrand}`}
          aria-label="Athleit home"
        >
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
          {status === 'ready' ? <AccountChip /> : null}
        </div>
      </Glass>
    </>
  );
}

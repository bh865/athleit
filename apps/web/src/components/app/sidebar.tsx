'use client';

import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOut } from '@/app/(auth)/actions';
import { Badge, Button, Glass, Icon, Logo, ThemeToggle } from '@/components/ui';

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
  const { status, contexts, displayName } = useApp();
  const pathname = usePathname();
  const hasFamily = contexts.some((c) => c.kind === 'family');
  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: 'house' },
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

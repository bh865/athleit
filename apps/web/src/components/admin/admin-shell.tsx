'use client';

import { moduleForPath, navGroups, formatCountdown, type PlatformRole } from '@athleit/core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore, type ReactNode } from 'react';

import { Button, Glass, Icon, Text } from '@/components/ui';

import styles from './admin-shell.module.css';
import { useAdmin } from './admin-provider';
import { CommandPalette } from './command-palette';
import { ADMIN_ICONS } from './icons';

// Mirrors the 833px breakpoint in admin-shell.module.css (phone: Overview, search and queues only).
const PHONE_MAX = 833;
const SMALL = `(max-width: ${PHONE_MAX}px)`;
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(SMALL);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const useIsSmall = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SMALL).matches,
    () => false,
  );

const asOfLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Environment badge: "Test mode" quiet, "Live" solid. The mode is passed down from the server. */
export function EnvBadge({ mode }: { mode: 'test' | 'live' }) {
  return (
    <span
      className={`${styles.env} ${mode === 'live' ? styles.live : ''}`}
      title={mode === 'live' ? 'Live mode' : 'Stripe is in test mode. No real money moves.'}
    >
      {mode === 'live' ? 'Live' : 'Test mode'}
    </span>
  );
}
export const RoleChip = ({ role }: { role: PlatformRole }) => (
  <span className={styles.chip}>{role[0]!.toUpperCase() + role.slice(1)}</span>
);

export function EditChip() {
  const { editing, secondsLeft } = useAdmin();
  return (
    <span className={`${styles.chip} ${editing ? styles.editing : ''}`} role="status">
      <Icon name={editing ? 'pencil' : 'lock-simple'} size="sm" />
      {editing ? `Editing ${formatCountdown(secondsLeft)}` : 'Read-only'}
    </span>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { role, displayName, stripeMode, asOf, editing, verify } = useAdmin();
  const pathname = usePathname();
  const small = useIsSmall();
  const current = moduleForPath(pathname);
  const phoneOk = current?.phone ?? false;

  return (
    <div className={styles.layout}>
      <Glass as="nav" level="bar" className={styles.rail} aria-label="Admin">
        <Link href="/admin" className={styles.brand}>
          athleit <span>ADMIN</span>
        </Link>
        {navGroups(role).map(({ group, items }) => (
          <div key={group} className={styles.group}>
            {group !== 'Overview' && <div className={styles.groupLabel}>{group}</div>}
            {items.map((m) => {
              const ico = ADMIN_ICONS[m.icon];
              const active = current?.key === m.key;
              return (
                <Link
                  key={m.key}
                  href={m.route}
                  className={`${styles.item} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {ico ? <Icon name={ico} weight={active ? 'fill' : 'regular'} /> : null}
                  <span className={styles.itemLabel}>{m.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </Glass>
      <div className={styles.main}>
        <header className={styles.top}>
          <CommandPalette role={role} />
          <div className={styles.status}>
            <EnvBadge mode={stripeMode} />
            <RoleChip role={role} />
            <EditChip />
            <span className={styles.asOf}>As of {asOfLabel(asOf)}</span>
            <span className={styles.avatar} title={displayName} aria-label={displayName}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        {!editing && (
          <div className={styles.banner} role="status">
            <Text variant="body">You’re in read-only mode. Verify to make changes.</Text>
            <Button variant="secondary" onClick={() => void verify()}>
              Verify
            </Button>
          </div>
        )}
        <main className={styles.content} data-testid="admin-main">
          {small && !phoneOk ? (
            <div className={styles.larger}>
              <Text variant="body">This page works best on a larger screen.</Text>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

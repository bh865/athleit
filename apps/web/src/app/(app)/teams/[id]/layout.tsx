'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from '@/components/app/app.module.css';
import { TeamProvider, useTeam } from '@/components/app/team-context';
import { Badge } from '@/components/ui';

function TeamHeader() {
  const { team, caps } = useTeam();
  const pathname = usePathname();
  const base = `/teams/${team.id}`;
  const tabs = [
    { href: base, label: 'Roster', show: caps.has('roster.viewLimited') },
    { href: `${base}/requests`, label: 'Requests', show: caps.has('joinRequests.decide') },
    { href: `${base}/invites`, label: 'Invites', show: caps.has('invites.createFamily') },
    { href: `${base}/members`, label: 'Members', show: caps.has('members.view') },
    {
      href: `${base}/settings`,
      label: 'Settings',
      show: caps.has('team.edit') || caps.has('team.view'),
    },
  ].filter((t) => t.show);
  return (
    <>
      <div className={styles.stack} style={{ gap: 'var(--space-1)' }}>
        <h1 className={styles.title}>{team.name}</h1>
        <p className={styles.muted}>
          <span style={{ textTransform: 'capitalize' }}>{team.sport}</span> · {team.season_label}
          {!caps.has('roster.edit') && caps.has('roster.viewFull') && (
            <>
              {' '}
              <Badge>Read only</Badge>
            </>
          )}
        </p>
      </div>
      <nav className={styles.tabs} aria-label="Team sections">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`${styles.tab} ${pathname === t.href ? styles.tabActive : ''}`}
            aria-current={pathname === t.href ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export default function TeamLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <TeamProvider teamId={id}>
      <TeamHeader />
      {children}
    </TeamProvider>
  );
}

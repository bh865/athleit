'use client';

import { memberSince, rolesLabel, sortRoles, type ContextRole } from '@athleit/core';
import { useEffect, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Avatar, ChipLabel, PageHeader, Text } from '@/components/ui';

import styles from './account.module.css';
import { AccountActions, AppearanceSection, HelpSection } from './more-sections';
import { NotificationSettings } from './notification-settings';
import { ProfileSection } from './profile-section';
import { RolesSection } from './roles-section';
import { SecuritySection } from './security-section';

const SECTIONS = [
  ['profile', 'Profile'],
  ['roles', 'Roles & places'],
  ['notifications', 'Notifications'],
  ['security', 'Security'],
  ['appearance', 'Appearance'],
  ['help', 'Help & legal'],
] as const;

/** Account: header card, a sub-nav of sections, and the account actions at the bottom. */
export function AccountView() {
  const { displayName, email, avatarUrl, contexts, memberSince: since } = useApp();
  const [current, setCurrent] = useState<string>('profile');

  // Follow the hash (sidebar links, redirects from the old notification settings page).
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (SECTIONS.some(([id]) => id === h)) {
        setCurrent(h);
        document.getElementById(h)?.scrollIntoView({ block: 'start' });
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const name = displayName ?? '';
  const roleChips = contexts
    .filter((c) => c.kind !== 'family' || c.roles.length)
    .map((c) =>
      c.kind === 'family'
        ? 'Parent'
        : `${rolesLabel(sortRoles(c.roles as ContextRole[]))} · ${c.title}`,
    );
  const unique = [...new Set(roleChips)];

  return (
    <div className={styles.page}>
      <PageHeader title="Account" />
      <div className={styles.header}>
        <Avatar name={name} src={avatarUrl} size="lg" />
        <div className={styles.headerText}>
          <Text variant="heading" as="p" className={styles.truncate}>
            {name}
          </Text>
          <Text muted className={styles.truncate}>
            {email}
          </Text>
          <div className={styles.chips}>
            {unique.map((r) => (
              <ChipLabel key={r}>{r}</ChipLabel>
            ))}
            {since ? <ChipLabel>{`Member since ${memberSince(since)}`}</ChipLabel> : null}
          </div>
        </div>
      </div>
      <div className={styles.layout}>
        <nav className={styles.subnav} aria-label="Account sections">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={styles.subnavLink}
              aria-current={current === id ? 'true' : undefined}
              onClick={() => setCurrent(id)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.sections}>
          <ProfileSection />
          <RolesSection />
          <section id="notifications" className={styles.section} aria-labelledby="notifications-h">
            <div className={styles.sectionHead}>
              <Text variant="heading" as="h2" id="notifications-h">
                Notifications
              </Text>
            </div>
            <NotificationSettings />
          </section>
          <SecuritySection />
          <AppearanceSection />
          <HelpSection />
          <AccountActions />
        </div>
      </div>
    </div>
  );
}

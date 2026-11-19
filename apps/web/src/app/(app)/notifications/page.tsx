'use client';

import {
  isRecentNotification,
  notificationSummary,
  relativeTime,
  type InAppPayload,
} from '@athleit/core';
import { getInAppNotifications, markNotificationsRead, subscribeToInApp } from '@athleit/db/api';
import Link from 'next/link';
import { useEffect } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Button, EmptyState, ErrorState, Icon, LoadingSkeleton, PageHeader } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './notifications.module.css';

/** The in-app notification centre: the "alerts" pattern (icon circle, title, detail, time; recent items on lime circles). */
export default function NotificationsPage() {
  const { userId } = useApp();
  const list = useLoad(() => getInAppNotifications(getClient()), []);
  const { reload } = list;
  useEffect(() => {
    if (!userId) return;
    return subscribeToInApp(getClient(), userId, reload);
  }, [userId, reload]);

  if (list.loading || list.error)
    return (
      <>
        <PageHeader title="Alerts" />
        {list.error ? (
          <ErrorState message="Can’t load alerts" onRetry={reload} />
        ) : (
          <LoadingSkeleton />
        )}
      </>
    );
  const rows = list.data ?? [];
  const unread = rows.filter((r) => r.read_at === null).length;
  return (
    <div className={styles.page}>
      <PageHeader
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : 'You’re up to date'}
        actions={
          <>
            {unread > 0 ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  await markNotificationsRead(getClient());
                  reload();
                }}
              >
                Mark all read
              </Button>
            ) : null}
            <Link href="/account#notifications" className={styles.gear}>
              Settings
            </Link>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="bell"
          title="You’re all caught up"
          body="New messages, announcements and schedule changes will show up here."
        />
      ) : (
        <ul className={styles.list} aria-label="Alerts">
          {rows.map((r) => {
            const s = notificationSummary(r.category, r.payload as InAppPayload);
            const recent = isRecentNotification(r.created_at, r.read_at);
            return (
              <li key={r.id}>
                <Link
                  href={s.href}
                  className={styles.row}
                  data-testid="alert-row"
                  onClick={() => void markNotificationsRead(getClient(), [r.id])}
                >
                  <span className={`${styles.circle} ${recent ? styles.lime : ''}`}>
                    <Icon name={s.icon} weight={recent ? 'fill' : 'regular'} />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{s.title}</span>
                    <span className={styles.detail}>{s.detail}</span>
                  </span>
                  <span className={styles.time}>{relativeTime(r.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

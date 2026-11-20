'use client';

import { getUnreadTotal, subscribeToNotifications } from '@athleit/db/api';
import { messagingTeams } from '@athleit/core';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Button, Icon, PageHeader } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './messages-shell.module.css';
import { ThreadList } from './thread-list';

/**
 * Page heading on top (like every page) with the unread total, then the one-inbox list column
 * (every team) beside the open conversation. On narrow screens only one of the two shows.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { contexts, userId } = useApp();
  const router = useRouter();
  const hasTeam = messagingTeams(contexts).length > 0;
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => void getUnreadTotal(getClient()).then((r) => r.data !== null && setUnread(r.data));
    refresh();
    return subscribeToNotifications(getClient(), userId, refresh);
  }, [userId]);
  const open = pathname !== '/messages';
  return (
    <div className={styles.page}>
      <PageHeader
        title="Messages"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        actions={
          hasTeam ? (
            <Button onClick={() => router.push('/messages/new')}>
              <Icon name="pencil" size="sm" /> New message
            </Button>
          ) : null
        }
      />
      <div className={styles.shell} data-open={open ? 'true' : 'false'}>
        <aside className={styles.list} aria-label="Conversations">
          <ThreadList onCompose={hasTeam ? () => router.push('/messages/new') : undefined} />
        </aside>
        <div className={styles.main}>{children}</div>
      </div>
    </div>
  );
}

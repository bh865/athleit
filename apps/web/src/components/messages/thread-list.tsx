'use client';

import { isUnread, listTimeLabel, previewOf, memberCountLabel, teamForScreen } from '@athleit/core';
import { getThreadList, subscribeToNotifications } from '@athleit/db/api';
import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Button, EmptyState, ErrorState, Icon, LoadingSkeleton, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './thread-list.module.css';

const ICON: Record<string, IconName> = {
  announcement: 'megaphone',
  group: 'users-three',
  direct: 'user',
};

/** The 340px column: circular type icons, bold title, one-line preview, time and unread dot. */
export function ThreadList() {
  const { active, contexts, userId } = useApp();
  const pathname = usePathname();
  const teamId = teamForScreen(contexts, active)?.id ?? null;
  const list = useLoad(
    () =>
      teamId ? getThreadList(getClient(), teamId) : Promise.resolve({ data: [], error: null }),
    [teamId],
  );
  const { reload } = list;

  // Unread counts and previews update live when anything arrives for this user.
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(getClient(), userId, reload);
  }, [userId, reload]);

  if (!teamId) {
    return (
      <EmptyState
        icon="chat-circle"
        title="Messages are per team"
        body="Switch to a team to see its conversations."
      />
    );
  }
  if (list.loading) return <LoadingSkeleton />;
  if (list.error) return <ErrorState message="Can’t load messages" onRetry={reload} />;

  const rows = list.data ?? [];
  return (
    <div className={styles.column}>
      <div className={styles.head}>
        <Text variant="label" muted as="h2">
          Conversations
        </Text>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon="chat-circle"
          title="No messages yet"
          body="Start a conversation with your team."
        />
      ) : (
        <ul className={styles.list} aria-label="Conversations">
          {rows.map((r) => {
            const selected = pathname === `/messages/${r.thread_id}`;
            const title = r.title ?? r.other_name ?? 'Message';
            const unread = isUnread(
              r.last_created_at
                ? { createdAt: r.last_created_at, senderId: r.last_sender_id }
                : null,
              userId,
              null,
            )
              ? r.unread_count > 0
              : r.unread_count > 0;
            return (
              <li key={r.thread_id}>
                <Link
                  href={`/messages/${r.thread_id}`}
                  className={`${styles.row} ${selected ? styles.selected : ''}`}
                  aria-current={selected ? 'page' : undefined}
                  data-testid="thread-row"
                >
                  <span
                    className={`${styles.avatar} ${r.type === 'announcement' ? styles.lime : ''}`}
                  >
                    <Icon
                      name={ICON[r.type] ?? 'chat-circle'}
                      weight={r.type === 'announcement' ? 'fill' : 'regular'}
                    />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.title}>{title}</span>
                    <span className={styles.preview}>
                      {r.last_body === null && !r.last_hidden && !r.last_deleted
                        ? previewOf(null)
                        : previewOf({
                            body: r.last_body ?? '',
                            deleted: r.last_deleted,
                            hidden: r.last_hidden,
                          })}
                    </span>
                    {r.type !== 'direct' ? (
                      <span className={styles.members}>{memberCountLabel(r.member_count)}</span>
                    ) : null}
                  </span>
                  <span className={styles.side}>
                    {r.last_created_at ? (
                      <span className={styles.time}>{listTimeLabel(r.last_created_at)}</span>
                    ) : null}
                    {unread ? (
                      <span
                        className={styles.dot}
                        role="img"
                        aria-label={`${r.unread_count} unread`}
                        data-testid="unread-dot"
                      />
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === 0 ? (
        <Link href="/messages/new">
          <Button>New message</Button>
        </Link>
      ) : null}
    </div>
  );
}

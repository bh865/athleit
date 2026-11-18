'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useApp } from '@/components/app/app-provider';
import { ButtonLink, Icon, PageHeader } from '@/components/ui';

import styles from './messages-shell.module.css';
import { ThreadList } from './thread-list';

/**
 * Page heading on top (like every page), then the list column (340px, inside a surface card) beside
 * the open conversation. On narrow screens only one of the two shows.
 */
export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { active } = useApp();
  const open = pathname !== '/messages';
  return (
    <div className={styles.page}>
      <PageHeader
        title="Messages"
        subtitle={active?.kind === 'team' ? active.title : undefined}
        actions={
          active?.kind === 'team' ? (
            <ButtonLink href="/messages/new">
              <Icon name="plus" size="sm" /> New message
            </ButtonLink>
          ) : null
        }
      />
      <div className={styles.shell} data-open={open ? 'true' : 'false'}>
        <aside className={styles.list} aria-label="Conversations">
          <ThreadList />
        </aside>
        <div className={styles.main}>{children}</div>
      </div>
    </div>
  );
}

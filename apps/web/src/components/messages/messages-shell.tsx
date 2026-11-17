'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import styles from './messages-shell.module.css';
import { ThreadList } from './thread-list';

/** List column (340px, inside a surface card) beside the open conversation. On narrow screens only one shows. */
export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const open = pathname !== '/messages';
  return (
    <div className={styles.shell} data-open={open ? 'true' : 'false'}>
      <aside className={styles.list} aria-label="Conversations">
        <ThreadList />
      </aside>
      <div className={styles.main}>{children}</div>
    </div>
  );
}

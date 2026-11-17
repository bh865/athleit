import type { ReactNode } from 'react';

import { MessagesShell } from '@/components/messages/messages-shell';

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <MessagesShell>{children}</MessagesShell>;
}

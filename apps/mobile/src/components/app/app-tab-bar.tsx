import { payViewsFor } from '@athleit/core';
import { usePathname, useRouter } from 'expo-router';

import { TabBar, type TabItem } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useUnread } from '@/lib/use-unread';

/** Screens without the tab bar: the open chat and notification settings. */
const hidden = (path: string) =>
  (path.startsWith('/messages/') && path !== '/messages/new') ||
  path.startsWith('/notifications/settings');

/**
 * The floating tab bar, mounted once in the (app) layout (outside the Stack) so it never slides
 * or remounts when screens change.
 */
export function AppTabBar() {
  const { contexts, userId } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  const hasFamily = contexts.some((c) => c.kind === 'family');
  const hasTeam = contexts.some((c) => c.kind === 'team');
  const showPay = payViewsFor(contexts, null).payer;
  const unread = useUnread(userId, hasTeam);
  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: 'house' },
    ...(contexts.length > 0
      ? [{ key: 'schedule', label: 'Schedule', icon: 'calendar-blank' } as TabItem]
      : []),
    ...(hasTeam
      ? [{ key: 'messages', label: 'Messages', icon: 'chat-circle', badge: unread } as TabItem]
      : []),
    ...(showPay ? [{ key: 'pay', label: 'Pay', icon: 'credit-card' } as TabItem] : []),
    ...(hasFamily ? [{ key: 'family', label: 'Family', icon: 'house-line' } as TabItem] : []),
    { key: 'more', label: 'More', icon: 'dots-three-circle' },
  ];
  const showTabs = tabs.length > 5 ? tabs.filter((t) => t.key !== 'family') : tabs;
  const active = pathname.startsWith('/more')
    ? 'more'
    : pathname.startsWith('/schedule') || pathname.startsWith('/events')
      ? 'schedule'
      : pathname.startsWith('/messages')
        ? 'messages'
        : pathname.startsWith('/pay')
          ? 'pay'
          : pathname.startsWith('/family')
            ? 'family'
            : pathname === '/'
              ? 'home'
              : null;

  if (hidden(pathname)) return null;
  return (
    <TabBar
      items={showTabs}
      active={active}
      onSelect={(key) => {
        router.replace(
          key === 'home'
            ? '/'
            : key === 'schedule'
              ? '/schedule'
              : key === 'messages'
                ? '/messages'
                : key === 'pay'
                  ? '/pay'
                  : key === 'more'
                    ? ('/more' as never)
                    : '/family',
        );
      }}
    />
  );
}

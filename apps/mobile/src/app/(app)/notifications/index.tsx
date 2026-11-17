import {
  isRecentNotification,
  notificationSummary,
  relativeTime,
  type InAppPayload,
} from '@athleit/core';
import { getInAppNotifications, markNotificationsRead, subscribeToInApp } from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1 } from '@/components/app/kit';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Text,
  useTheme,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** Alerts: icon circle, title, detail, time; recent items on lime circles. */
export default function AlertsScreen() {
  const { userId } = useApp();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.color;
  const list = useLoad(() => getInAppNotifications(supabase), []);
  const { reload } = list;
  useEffect(() => {
    if (!userId) return;
    return subscribeToInApp(supabase, userId, reload);
  }, [userId, reload]);

  const rows = list.data ?? [];
  const unread = rows.filter((r) => r.read_at === null).length;
  return (
    <AppScreen>
      <View style={{ gap: space[3] }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <H1>Alerts</H1>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            onPress={() => router.push('/notifications/settings' as never)}
            style={{
              minWidth: componentTokens.minTarget,
              minHeight: componentTokens.minTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="bodyBold">Settings</Text>
          </Pressable>
        </View>
        {unread > 0 ? (
          <Button
            title="Mark all read"
            variant="secondary"
            onPress={async () => {
              await markNotificationsRead(supabase);
              reload();
            }}
          />
        ) : null}
        {list.loading ? (
          <LoadingSkeleton rows={5} />
        ) : list.error ? (
          <ErrorState message="Can’t load alerts" onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You’re all caught up"
            body="New messages, announcements and schedule changes will show up here."
          />
        ) : (
          rows.map((r) => {
            const s = notificationSummary(r.category, r.payload as InAppPayload);
            const recent = isRecentNotification(r.created_at, r.read_at);
            return (
              <Pressable
                key={r.id}
                testID="alert-row"
                accessibilityRole="button"
                accessibilityLabel={`${s.title}. ${s.detail}. ${relativeTime(r.created_at)}`}
                onPress={() => {
                  void markNotificationsRead(supabase, [r.id]);
                  router.push(s.href as never);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  padding: space[4],
                  borderRadius: radius.lg,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.line,
                  minHeight: componentTokens.listRow.height,
                }}
              >
                <View
                  style={{
                    width: componentTokens.avatar.md,
                    height: componentTokens.avatar.md,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: recent ? c.accent : c.surfaceAlt,
                  }}
                >
                  <Icon
                    name={s.icon}
                    weight={recent ? 'fill' : 'regular'}
                    color={recent ? c.accentInk : c.ink}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{s.title}</Text>
                  <Text variant="caption" muted>
                    {s.detail}
                  </Text>
                </View>
                <Text variant="caption" muted>
                  {relativeTime(r.created_at)}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </AppScreen>
  );
}

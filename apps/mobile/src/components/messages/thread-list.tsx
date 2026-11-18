import { listTimeLabel, memberCountLabel, previewOf, teamForScreen } from '@athleit/core';
import { getThreadList, subscribeToNotifications } from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

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

const ICON: Record<string, IconName> = {
  announcement: 'megaphone',
  group: 'users-three',
  direct: 'user',
};

/** 52px circular type icons, bold title, one-line preview, time top-right, unread dot. */
export function ThreadList() {
  const { active, contexts, userId } = useApp();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.color;
  const teamId = teamForScreen(contexts, active)?.id ?? null;
  const list = useLoad(
    () => (teamId ? getThreadList(supabase, teamId) : Promise.resolve({ data: [], error: null })),
    [teamId],
  );
  const { reload } = list;
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(supabase, userId, reload);
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
  const rows = list.data ?? [];
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Messages</H1>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New message"
          onPress={() => router.push('/messages/new' as never)}
          style={{
            width: componentTokens.iconButton.size,
            height: componentTokens.iconButton.size,
            borderRadius: radius.pill,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" color={c.accentInk} />
        </Pressable>
      </View>
      {list.loading ? (
        <LoadingSkeleton rows={5} />
      ) : list.error ? (
        <ErrorState message="Can’t load messages" onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="chat-circle"
          title="No messages yet"
          body="Start a conversation with your team."
          action={
            <Button title="New message" onPress={() => router.push('/messages/new' as never)} />
          }
        />
      ) : (
        rows.map((r) => {
          const title = r.title ?? r.other_name ?? 'Message';
          const unread = r.unread_count > 0;
          return (
            <Pressable
              key={r.thread_id}
              testID="thread-row"
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${previewOf(r.last_body === null && !r.last_hidden ? null : { body: r.last_body ?? '', deleted: r.last_deleted, hidden: r.last_hidden })}${unread ? `. ${r.unread_count} unread` : ''}`}
              onPress={() => router.push(`/messages/${r.thread_id}` as never)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: componentTokens.chat.threadAvatarMobile + space[2],
              }}
            >
              <View
                style={{
                  width: componentTokens.chat.threadAvatarMobile,
                  height: componentTokens.chat.threadAvatarMobile,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: r.type === 'announcement' ? c.accent : c.surfaceAlt,
                }}
              >
                <Icon
                  name={ICON[r.type] ?? 'chat-circle'}
                  weight={r.type === 'announcement' ? 'fill' : 'regular'}
                  color={r.type === 'announcement' ? c.accentInk : c.ink}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {r.last_body === null && !r.last_hidden && !r.last_deleted
                    ? previewOf(null)
                    : previewOf({
                        body: r.last_body ?? '',
                        deleted: r.last_deleted,
                        hidden: r.last_hidden,
                      })}
                </Text>
                {r.type !== 'direct' ? (
                  <Text variant="caption" muted>
                    {memberCountLabel(r.member_count)}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: space[2] }}>
                {r.last_created_at ? (
                  <Text variant="caption" muted>
                    {listTimeLabel(r.last_created_at)}
                  </Text>
                ) : null}
                {unread ? (
                  <View
                    accessibilityLabel={`${r.unread_count} unread`}
                    style={{
                      width: componentTokens.chat.unreadDot,
                      height: componentTokens.chat.unreadDot,
                      borderRadius: radius.pill,
                      backgroundColor: c.bubbleOwn,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

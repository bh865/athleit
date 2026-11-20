import {
  inboxPreview,
  draftPreview,
  isMuted,
  listTimeLabel,
  rowStatus,
  threadTitle,
  type InboxRow,
} from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';

import { Avatar, Icon, Mono, Text, useTheme } from '@/components/ui';

const ACTION_W = 88;

export interface RowActions {
  onOpen: () => void;
  onLongPress: () => void;
  onMarkRead: () => void;
  onMute: () => void;
  onArchive: () => void;
}

/**
 * One conversation. Status by priority (Failed, Unread, Draft, Muted, Archived), never by colour
 * alone. Swipe right marks read; swipe left reveals Mute and Archive. Swipes are built from
 * PanResponder + Animated (no native dependency) and every action is also reachable through the
 * long-press menu and the accessibility actions, so nothing depends on the gesture.
 */
export function InboxListRow({
  row,
  myId,
  draft,
  hasFailed,
  showTeam,
  inArchivedFilter,
  actions,
}: {
  row: InboxRow;
  myId: string | null;
  draft: string | null;
  hasFailed: boolean;
  showTeam: boolean;
  inArchivedFilter: boolean;
  actions: RowActions;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const [x] = useState(() => new Animated.Value(0));
  const status = rowStatus(row, { hasFailed, draft, inArchivedFilter });
  const title = threadTitle(row);
  const muted = isMuted(row.mutedUntil);
  const unread = status === 'unread';

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => x.setValue(Math.max(-ACTION_W * 2, Math.min(ACTION_W, g.dx))),
        onPanResponderRelease: (_e, g) => {
          const to = g.dx > ACTION_W / 2 ? ACTION_W : g.dx < -ACTION_W ? -ACTION_W * 2 : 0;
          Animated.spring(x, { toValue: to, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [x],
  );
  const close = () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();

  const previewText = hasFailed
    ? 'Not sent. Tap to retry'
    : status === 'draft' && draft
      ? draftPreview(draft)
      : inboxPreview(row, myId);
  const previewColor = hasFailed ? c.bad : c.muted;
  const a11y = [
    title,
    showTeam ? row.teamName : null,
    row.unreadCount > 0 ? `${row.unreadCount} unread` : null,
    status === 'muted' ? 'muted' : null,
    status === 'draft' ? 'draft' : null,
    hasFailed ? 'failed to send' : null,
    previewText,
    row.lastCreatedAt ? listTimeLabel(row.lastCreatedAt) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const sideButton = (
    side: 'left' | 'right',
    label: string,
    icon: 'check' | 'bell-slash' | 'archive-box',
    onPress: () => void,
    bg: string,
    fg: string,
    offset: number,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        close();
        onPress();
      }}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: offset,
        width: ACTION_W,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1],
      }}
    >
      <Icon name={icon} color={fg} />
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ overflow: 'hidden', borderRadius: radius.md }}>
      {row.unreadCount > 0 ? sideButton('left', 'Mark read', 'check', actions.onMarkRead, c.surfaceAlt, c.ink, 0) : null}
      {sideButton('right', muted ? 'Unmute' : 'Mute', 'bell-slash', actions.onMute, c.surfaceAlt, c.ink, ACTION_W)}
      {sideButton('right', 'Archive', 'archive-box', actions.onArchive, c.ink, c.background, 0)}
      <Animated.View
        {...pan.panHandlers}
        style={{ transform: [{ translateX: x }], backgroundColor: c.background }}
      >
        <Pressable
          testID="thread-row"
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityActions={[
            { name: 'longpress', label: 'More actions' },
            { name: 'archive', label: 'Archive' },
            { name: 'mute', label: muted ? 'Unmute' : 'Mute' },
            ...(row.unreadCount > 0 ? [{ name: 'markRead', label: 'Mark read' }] : []),
          ]}
          onAccessibilityAction={(e) => {
            const n = e.nativeEvent.actionName;
            if (n === 'archive') actions.onArchive();
            else if (n === 'mute') actions.onMute();
            else if (n === 'markRead') actions.onMarkRead();
            else actions.onLongPress();
          }}
          onPress={() => {
            close();
            actions.onOpen();
          }}
          onLongPress={actions.onLongPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            minHeight: componentTokens.chat.threadAvatarMobile + space[3],
            paddingVertical: space[2],
          }}
        >
          <ThreadAvatar row={row} title={title} />
          <View style={{ flex: 1, gap: space[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Text variant={unread ? 'bodyBold' : 'body'} numberOfLines={1} style={{ flexShrink: 1 }}>
                {title}
              </Text>
              {showTeam ? (
                <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 0 }}>
                  {row.teamName}
                </Text>
              ) : null}
              {row.pinnedAt ? <Icon name="push-pin" size="sm" color={c.muted} /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              {hasFailed ? <Icon name="warning-circle" size="sm" color={c.bad} /> : null}
              {status === 'muted' ? <Icon name="bell-slash" size="sm" color={c.muted} /> : null}
              {status === 'archived' ? <Icon name="archive-box" size="sm" color={c.muted} /> : null}
              <Text
                variant="caption"
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  color: previewColor,
                  fontWeight: unread ? '700' : undefined,
                }}
              >
                {previewText}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: space[2] }}>
            {row.lastCreatedAt ? <Mono style={{ color: c.muted }}>{listTimeLabel(row.lastCreatedAt)}</Mono> : null}
            {row.unreadCount > 0 ? (
              <View
                accessibilityLabel={`${row.unreadCount} unread`}
                style={{
                  minWidth: space[6],
                  height: space[6],
                  paddingHorizontal: space[2],
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Lime only for a live unread count; a muted thread's count is quiet.
                  backgroundColor: muted ? c.surfaceAlt : c.accent,
                }}
              >
                <Mono style={{ color: muted ? c.muted : c.accentInk }}>{row.unreadCount}</Mono>
              </View>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Initials for direct, a group glyph for groups, a megaphone tile for announcements. */
export function ThreadAvatar({ row, title }: { row: InboxRow; title: string }) {
  const { theme } = useTheme();
  const c = theme.color;
  const size = componentTokens.chat.threadAvatarMobile;
  if (row.type === 'direct') return <Avatar name={title} size="lg" />;
  const announcement = row.type === 'announcement';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: announcement ? radius.md : radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: announcement ? c.accent : c.surfaceAlt,
      }}
    >
      <Icon
        name={announcement ? 'megaphone' : 'users-three'}
        weight={announcement ? 'fill' : 'regular'}
        color={announcement ? c.accentInk : c.ink}
      />
    </View>
  );
}

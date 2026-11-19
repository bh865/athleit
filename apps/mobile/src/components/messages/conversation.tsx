import {
  deliveryStatus,
  friendlyError,
  groupMessages,
  memberCountLabel,
  REACTIONS,
  type ChatItem,
  type ChatMessage,
  isTeamStaff,
} from '@athleit/core';
import {
  deleteMessage,
  hideMessage,
  reportMessage,
  setThreadMute,
  toggleReaction,
} from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Backdrop,
  Button,
  EmptyState,
  ErrorState,
  Glass,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { reportOpenThread, setOpenThread } from '@/lib/push';
import { supabase } from '@/lib/supabase';

import { Bubble, REACTION_ICON, REACTION_LABEL } from './bubble';
import { Composer } from './composer';
import { useThread } from './use-thread';

const NEAR_BOTTOM = 80;

export function Conversation({ threadId }: { threadId: string }) {
  const { userId, contexts } = useApp();
  const me = userId ?? '';
  const t = useThread(threadId, me);
  const { theme } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ChatItem>>(null);
  const atBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [actions, setActions] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const isStaff = t.thread ? isTeamStaff(contexts, t.thread.team_id) : false;
  const isAnnouncement = t.thread?.type === 'announcement';
  const archived = Boolean(t.thread?.archived_at);
  const canPost = isAnnouncement ? isStaff : true;

  const items = useMemo(() => groupMessages(t.messages, me), [t.messages, me]);
  const inverted = useMemo(() => [...items].reverse(), [items]);
  const byId = useMemo(() => new Map(t.messages.map((m) => [m.id, m])), [t.messages]);
  const othersRead = useMemo(
    () => t.reads.filter((r) => r.profile_id !== me).map((r) => r.last_read_at),
    [t.reads, me],
  );
  const title =
    t.thread?.title ?? [...t.names.entries()].find(([id]) => id !== me)?.[1] ?? 'Message';
  const count = t.messages.length;

  // While this conversation is open: no foreground banner for it, and the worker skips push for this device.
  useEffect(() => {
    setOpenThread(threadId);
    void reportOpenThread(threadId);
    const timer = setInterval(() => void reportOpenThread(threadId), 15_000);
    return () => {
      clearInterval(timer);
      setOpenThread(null);
      void reportOpenThread(null);
    };
  }, [threadId]);

  useEffect(() => {
    if (t.state !== 'ready') return;
    if (atBottom.current) void t.markRead();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a live arrival
    else if (t.incoming > 0) setShowPill(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on arrival only
  }, [count, t.state]);

  const act = useCallback(
    async (
      fn: () => PromiseLike<{ error: { message: string; code?: string | undefined } | null }>,
      ok?: string,
    ) => {
      const r = await fn();
      if (r.error) toast(friendlyError(r.error), 'danger');
      else if (ok) toast(ok);
      void t.refetchLatest();
    },
    [t, toast],
  );

  const frame = (children: React.ReactNode) => (
    <Backdrop>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {children}
      </SafeAreaView>
    </Backdrop>
  );

  if (t.state === 'loading') return frame(<LoadingSkeleton rows={5} />);
  if (t.state === 'error') {
    return frame(
      <ErrorState message={t.error ?? 'Can’t load messages'} onRetry={() => void t.load()} />,
    );
  }

  const mine = actions ? actions.senderId === me : false;
  return (
    <Backdrop>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Glass
          level="bar"
          cornerRadius={radius.xl}
          accessibilityRole="header"
          style={{
            marginHorizontal: space[2],
            marginTop: insets.top,
            minHeight: componentTokens.chat.headerHeightMobile - insets.top,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            paddingHorizontal: space[2],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to messages"
            onPress={() => router.replace('/messages' as never)}
            style={{
              width: componentTokens.minTarget,
              height: componentTokens.minTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="caret-left" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="bodyBold" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" muted>
              {isAnnouncement ? 'Announcements' : memberCountLabel(t.memberCount)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mute notifications for 8 hours"
            onPress={() =>
              void act(
                () =>
                  setThreadMute(
                    supabase,
                    threadId,
                    new Date(Date.now() + 8 * 3600_000).toISOString(),
                  ),
                'Muted for 8 hours',
              )
            }
            style={{
              width: componentTokens.minTarget,
              height: componentTokens.minTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell-slash" />
          </Pressable>
        </Glass>

        {inverted.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="chat-circle"
              title="No messages yet"
              body={
                canPost ? 'Say hello to get things started.' : 'Announcements will show up here.'
              }
            />
          </View>
        ) : (
          <FlatList
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            ref={list}
            data={inverted}
            inverted
            keyExtractor={(i) => i.key}
            accessibilityLabel="Messages"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: space[4], gap: space[2] }}
            onEndReached={() => void t.loadOlder()}
            onEndReachedThreshold={0.4}
            onScroll={(e) => {
              atBottom.current = e.nativeEvent.contentOffset.y < NEAR_BOTTOM;
              if (atBottom.current && showPill) {
                setShowPill(false);
                void t.markRead();
              }
            }}
            scrollEventThrottle={64}
            ListHeaderComponent={
              t.typing.length > 0 ? (
                <View
                  accessibilityRole="text"
                  accessibilityLabel={`${t.names.get(t.typing[0]!) ?? 'Someone'} is typing`}
                  style={{
                    flexDirection: 'row',
                    gap: space[1],
                    alignSelf: 'flex-start',
                    padding: space[3],
                    borderRadius: componentTokens.bubble.radius,
                    borderBottomLeftRadius: componentTokens.bubble.tail,
                    backgroundColor: theme.color.bubbleOther,
                  }}
                >
                  {[0, 1, 2].map((d) => (
                    <View
                      key={d}
                      style={{
                        width: componentTokens.chat.typingDot,
                        height: componentTokens.chat.typingDot,
                        borderRadius: radius.pill,
                        backgroundColor: theme.color.muted,
                      }}
                    />
                  ))}
                </View>
              ) : undefined
            }
            ListFooterComponent={
              t.loadingOlder ? (
                <Text variant="caption" muted style={{ textAlign: 'center' }}>
                  Loading earlier messages…
                </Text>
              ) : undefined
            }
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <Text
                  variant="caption"
                  muted
                  style={{ alignSelf: 'center', paddingVertical: space[2] }}
                >
                  {item.label}
                </Text>
              ) : (
                <Bubble
                  message={item.message}
                  own={item.own}
                  firstInRun={item.firstInRun}
                  lastInRun={item.lastInRun}
                  status={
                    item.own && item.lastInRun ? deliveryStatus(item.message, othersRead) : null
                  }
                  reactions={t.reactions[item.message.id] ?? []}
                  attachments={t.attachments[item.message.id] ?? []}
                  quoted={
                    item.message.replyToId ? (byId.get(item.message.replyToId) ?? null) : null
                  }
                  myId={me}
                  announcement={Boolean(isAnnouncement)}
                  readCount={t.reads.length}
                  showReads={isStaff}
                  onLongPress={() => setActions(item.message)}
                  onReact={(e) => void act(() => toggleReaction(supabase, item.message.id, e))}
                  onRetry={() => void t.retry(item.message.clientId ?? item.message.id)}
                  onDiscard={() => t.discard(item.message.clientId ?? item.message.id)}
                />
              )
            }
          />
        )}

        {showPill ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              alignSelf: 'center',
              bottom: componentTokens.chat.composerHeightMobile + space[8] + insets.bottom,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scroll to newest messages"
              onPress={() => {
                list.current?.scrollToOffset({ offset: 0, animated: true });
                setShowPill(false);
                void t.markRead();
              }}
            >
              <Glass
                level="sheet"
                cornerRadius={radius.pill}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                  paddingHorizontal: space[4],
                  minHeight: componentTokens.minTarget,
                }}
              >
                <Icon name="arrow-down" size="sm" />
                <Text variant="bodyBold">New messages</Text>
              </Glass>
            </Pressable>
          </View>
        ) : null}

        {archived ? (
          <Text variant="caption" muted style={{ textAlign: 'center', padding: space[4] }}>
            This conversation is archived.
          </Text>
        ) : canPost ? (
          <Composer
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            onTyping={t.notifyTyping}
            onUpload={t.upload}
            onSend={async (body, files) => {
              await t.send(body, replyTo?.id ?? null, files);
              setReplyTo(null);
              list.current?.scrollToOffset({ offset: 0, animated: true });
            }}
          />
        ) : (
          <Text variant="caption" muted style={{ textAlign: 'center', padding: space[4] }}>
            Only coaches and managers can post here.
          </Text>
        )}
      </KeyboardAvoidingView>

      <Sheet open={actions !== null} onClose={() => setActions(null)} title="Message actions">
        <Text variant="heading">Message</Text>
        {!isAnnouncement ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityLabel={`React: ${REACTION_LABEL[e]}`}
                onPress={() => {
                  if (actions) void act(() => toggleReaction(supabase, actions.id, e));
                  setActions(null);
                }}
                style={{
                  width: componentTokens.minTarget,
                  height: componentTokens.minTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: theme.color.surfaceAlt,
                }}
              >
                <Icon name={REACTION_ICON[e]} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {!isAnnouncement ? (
          <Button
            title="Reply"
            variant="secondary"
            icon="arrow-bend-up-left"
            onPress={() => {
              setReplyTo(actions);
              setActions(null);
            }}
          />
        ) : null}
        {mine ? (
          <Button
            title="Delete"
            variant="secondary"
            icon="trash"
            onPress={() => {
              if (actions) void act(() => deleteMessage(supabase, actions.id), 'Message deleted');
              setActions(null);
            }}
          />
        ) : (
          <Button
            title="Report"
            variant="secondary"
            icon="flag"
            onPress={() => {
              setReporting(actions);
              setActions(null);
            }}
          />
        )}
        {isStaff && !mine ? (
          <Button
            title="Remove for everyone"
            variant="ghost"
            icon="eye-slash"
            onPress={() => {
              if (actions)
                void act(
                  () => hideMessage(supabase, actions.id, 'Removed by staff'),
                  'Message removed',
                );
              setActions(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={reporting !== null} onClose={() => setReporting(null)} title="Report message">
        <Text variant="heading">Report this message</Text>
        <Text muted>Staff will review it. The sender isn’t told who reported it.</Text>
        <TextField label="What’s wrong?" value={reason} onChangeText={setReason} maxLength={500} />
        <Button
          title="Send report"
          loading={busy}
          disabled={reason.trim().length === 0}
          onPress={async () => {
            if (!reporting) return;
            setBusy(true);
            const r = await reportMessage(supabase, reporting.id, reason);
            setBusy(false);
            if (r.error) toast(friendlyError(r.error), 'danger');
            else {
              toast('Report sent');
              setReporting(null);
              setReason('');
            }
          }}
        />
      </Sheet>
    </Backdrop>
  );
}

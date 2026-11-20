import {
  friendlyError,
  featuredAnnouncement,
  filterInbox,
  inboxRowFromDb,
  isMuted,
  isPlayerOnly,
  isStaffAnywhere,
  messagingTeams,
  muteDurationLabel,
  muteUntil,
  MUTE_DURATIONS,
  searchInbox,
  shouldSearchServer,
  showFilterChips,
  showTeamChip,
  sortInbox,
  threadTitle,
  type InboxFilter,
  type InboxRow,
} from '@athleit/core';
import {
  getInbox,
  markThreadRead,
  searchMessages,
  setThreadArchivedForMe,
  setThreadMute,
  setThreadPinned,
  subscribeToNotifications,
} from '@athleit/db/api';
import { componentTokens, radius, space, textStyles } from '@athleit/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, TextInput, View } from 'react-native';

import { H1 } from '@/components/app/kit';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  useTheme,
  useToast,
} from '@/components/ui';
import { useDrafts } from '@/lib/drafts';
import { fontFace } from '@/lib/fonts';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { InboxListRow, ThreadAvatar } from './inbox-row';

/** One inbox across every team: filters, search, swipe and long-press actions, drafts. */
export function ThreadList() {
  const { contexts, userId } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { theme } = useTheme();
  const c = theme.color;
  const teams = messagingTeams(contexts);
  const playerOnly = isPlayerOnly(contexts);
  const staff = isStaffAnywhere(contexts);

  const list = useLoad(
    () => (teams.length === 0 ? Promise.resolve({ data: [], error: null }) : getInbox(supabase, { limit: 100 })),
    [teams.length],
  );
  const { reload } = list;
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(supabase, userId, reload);
  }, [userId, reload]);
  // Reload when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => sub.remove();
  }, [reload]);

  const rows = useMemo(() => sortInbox((list.data ?? []).map(inboxRowFromDb)), [list.data]);
  const { drafts, failed, refresh } = useDrafts(rows.map((r) => r.threadId));
  useFocusEffect(
    useCallback(() => {
      void refresh();
      reload();
    }, [refresh, reload]),
  );

  const [filter, setFilter] = useState<InboxFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<InboxRow | null>(null);
  const [muteFor, setMuteFor] = useState<InboxRow | null>(null);

  // Message search below the local matches, after 3 characters (debounced and cancelable).
  type Hit = { thread_id: string; message_id: string; snippet: string; team_name: string; sender_name: string | null };
  const [settled, setSettled] = useState<{ query: string; hits: Hit[] }>({ query: '', hits: [] });
  const trimmed = query.trim();
  const serverSearch = shouldSearchServer(query);
  useEffect(() => {
    if (!serverSearch) return;
    let live = true;
    const id = setTimeout(() => {
      void searchMessages(supabase, trimmed).then((r) => {
        if (live) setSettled({ query: trimmed, hits: r.data ?? [] });
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [serverSearch, trimmed]);
  const searching = serverSearch && settled.query !== trimmed;
  const hits = serverSearch && settled.query === trimmed ? settled.hits : [];

  const act = async (fn: () => Promise<{ error: unknown }>, done?: string) => {
    const res = await fn();
    if (res.error) toast(friendlyError(res.error as never), 'danger');
    else if (done) toast(done);
    reload();
  };
  const markRead = (r: InboxRow) =>
    r.lastMessageId ? act(() => markThreadRead(supabase, r.threadId, r.lastMessageId as string)) : undefined;
  const archive = (r: InboxRow) =>
    act(() => setThreadArchivedForMe(supabase, r.threadId, !r.archivedForMe), r.archivedForMe ? 'Moved back to your inbox' : 'Archived until the next message');
  const pin = (r: InboxRow) => act(() => setThreadPinned(supabase, r.threadId, !r.pinnedAt));
  const mute = (r: InboxRow, until: string | null) => act(() => setThreadMute(supabase, r.threadId, until));

  const visible = useMemo(() => {
    const filtered = filterInbox(rows, filter);
    return query.trim() ? searchInbox(filtered, query, userId) : filtered;
  }, [rows, filter, query, userId]);
  const featured = filter.kind === 'all' && !query ? featuredAnnouncement(rows) : null;
  const pinned = visible.filter((r) => r.pinnedAt && r.threadId !== featured?.threadId);
  const rest = visible.filter((r) => !r.pinnedAt && r.threadId !== featured?.threadId);

  const compose = () => router.push('/messages/new' as never);
  const open = (r: InboxRow) => router.push(`/messages/${r.threadId}` as never);
  const showChips = showFilterChips(playerOnly);
  const showTeam = showTeamChip(teams.length, playerOnly);

  const renderRow = (r: InboxRow) => (
    <InboxListRow
      key={r.threadId}
      row={r}
      myId={userId}
      draft={drafts[r.threadId] ?? null}
      hasFailed={failed.has(r.threadId)}
      showTeam={showTeam}
      inArchivedFilter={filter.kind === 'archived'}
      actions={{
        onOpen: () => open(r),
        onLongPress: () => setMenuFor(r),
        onMarkRead: () => void markRead(r),
        onMute: () => (isMuted(r.mutedUntil) ? void mute(r, null) : setMuteFor(r)),
        onArchive: () => void archive(r),
      }}
    />
  );

  const header = (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Messages</H1>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New message"
          onPress={compose}
          style={{
            width: componentTokens.iconButton.size,
            height: componentTokens.iconButton.size,
            borderRadius: radius.pill,
            backgroundColor: c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="pencil" color={c.accentInk} />
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: componentTokens.minTarget,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          backgroundColor: c.surfaceAlt,
        }}
      >
        <Icon name="magnifying-glass" color={c.muted} />
        <TextInput
          accessibilityLabel="Search conversations and people"
          placeholder="Search conversations and people"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, minHeight: componentTokens.minTarget, color: c.ink, fontFamily: fontFace.sans.semibold, fontSize: textStyles.body.size }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={12}>
            <Icon name="x-circle" weight="fill" color={c.muted} />
          </Pressable>
        ) : null}
      </View>
      {showChips ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityRole="tablist">
          <Chip label="All" selected={filter.kind === 'all'} onPress={() => setFilter({ kind: 'all' })} />
          <Chip label="Unread" selected={filter.kind === 'unread'} onPress={() => setFilter(filter.kind === 'unread' ? { kind: 'all' } : { kind: 'unread' })} />
          <Chip label="Announcements" selected={filter.kind === 'announcements'} onPress={() => setFilter(filter.kind === 'announcements' ? { kind: 'all' } : { kind: 'announcements' })} />
          {teams.length >= 2
            ? teams.map((t) => (
                <Chip
                  key={t.id}
                  label={t.title}
                  selected={filter.kind === 'team' && filter.teamId === t.id}
                  onPress={() => setFilter(filter.kind === 'team' && filter.teamId === t.id ? { kind: 'all' } : { kind: 'team', teamId: t.id })}
                />
              ))
            : null}
          <Chip label="Archived" selected={filter.kind === 'archived'} onPress={() => setFilter(filter.kind === 'archived' ? { kind: 'all' } : { kind: 'archived' })} />
        </ScrollView>
      ) : null}
    </View>
  );

  let body;
  if (teams.length === 0) {
    // Club admin only: messages live inside each team.
    body = <EmptyState icon="chat-circle" title="Messages live inside each team" body="Join or switch to a team to see its conversations." />;
  } else if (list.loading && !list.data) {
    body = <LoadingSkeleton rows={5} />;
  } else if (list.error && !list.data) {
    body = <ErrorState message="Can’t load messages" onRetry={reload} />;
  } else if (rows.length === 0) {
    body = staff ? (
      <EmptyState icon="chat-circle" title="No conversations yet" body="Message a parent, start a group or post an announcement." action={<Button title="New message" onPress={compose} />} />
    ) : (
      <EmptyState icon="chat-circle" title="No messages yet" body="When your coach or team writes, it shows up here." action={<Button title="New message" onPress={compose} />} />
    );
  } else if (visible.length === 0 && hits.length === 0 && !searching) {
    body = <EmptyState icon="magnifying-glass" title="No results" body={query ? `Nothing matches “${query}”.` : 'Nothing here.'} />;
  } else {
    body = (
      <View style={{ gap: space[2] }}>
        {featured ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Announcement, ${threadTitle(featured)}, ${featured.unreadCount} unread`}
            onPress={() => open(featured)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg, backgroundColor: c.surface }}
          >
            <ThreadAvatar row={featured} title={threadTitle(featured)} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" muted>
                Announcement{showTeam ? ` · ${featured.teamName}` : ''}
              </Text>
              <Text variant="bodyBold" numberOfLines={1}>
                {threadTitle(featured)}
              </Text>
              <Text variant="caption" muted numberOfLines={2}>
                {featured.lastBody}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {pinned.length ? (
          <>
            <Text variant="label" muted accessibilityRole="header">
              Pinned
            </Text>
            {pinned.map(renderRow)}
            {rest.length ? (
              <Text variant="label" muted accessibilityRole="header">
                All messages
              </Text>
            ) : null}
          </>
        ) : null}
        {rest.map(renderRow)}
        {shouldSearchServer(query) ? (
          <View style={{ gap: space[2], paddingTop: space[3] }}>
            <Text variant="label" muted accessibilityRole="header">
              In messages
            </Text>
            {searching ? <LoadingSkeleton rows={2} /> : null}
            {hits.map((h) => (
              <Pressable
                key={h.message_id}
                accessibilityRole="button"
                accessibilityLabel={`${h.sender_name ?? 'Someone'} in ${h.team_name}: ${h.snippet}`}
                onPress={() => router.push(`/messages/${h.thread_id}?message=${h.message_id}` as never)}
                style={{ minHeight: componentTokens.minTarget, justifyContent: 'center', gap: space[1] }}
              >
                <Text variant="caption" muted>
                  {h.sender_name ?? 'Someone'} · {h.team_name}
                </Text>
                <Text numberOfLines={2}>{h.snippet}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: space[4] }}>
      {header}
      {list.error && list.data ? <Text variant="caption" muted>Showing saved messages. You may be offline.</Text> : null}
      {body}
      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor ? threadTitle(menuFor) : 'Conversation'}>
        {menuFor ? (
          <View style={{ gap: space[2] }}>
            {[
              { label: menuFor.pinnedAt ? 'Unpin' : 'Pin', icon: 'push-pin' as const, run: () => pin(menuFor) },
              ...(menuFor.unreadCount > 0 ? [{ label: 'Mark read', icon: 'check' as const, run: () => markRead(menuFor) }] : []),
              { label: isMuted(menuFor.mutedUntil) ? 'Unmute' : 'Mute…', icon: 'bell-slash' as const, run: () => (isMuted(menuFor.mutedUntil) ? mute(menuFor, null) : setMuteFor(menuFor)) },
              { label: menuFor.archivedForMe ? 'Move to inbox' : 'Archive', icon: 'archive-box' as const, run: () => archive(menuFor) },
            ].map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={() => {
                  setMenuFor(null);
                  void a.run();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}
              >
                <Icon name={a.icon} />
                <Text variant="bodyBold">{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>
      <Sheet open={muteFor !== null} onClose={() => setMuteFor(null)} title="Mute notifications">
        <View style={{ gap: space[2] }}>
          {MUTE_DURATIONS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              onPress={() => {
                const r = muteFor;
                setMuteFor(null);
                if (r) void mute(r, muteUntil(d));
              }}
              style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
            >
              <Text variant="bodyBold">{muteDurationLabel(d)}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

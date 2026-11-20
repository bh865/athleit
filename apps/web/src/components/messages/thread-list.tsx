'use client';

import {
  draftPreview,
  featuredAnnouncement,
  filterInbox,
  friendlyError,
  inboxPreview,
  inboxRowFromDb,
  isMuted,
  isPlayerOnly,
  listTimeLabel,
  messagingTeams,
  MUTE_DURATIONS,
  muteDurationLabel,
  muteUntil,
  rowStatus,
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
  getInboxAll,
  markThreadRead,
  searchMessages,
  setThreadArchivedForMe,
  setThreadMute,
  setThreadPinned,
  subscribeToNotifications,
} from '@athleit/db/api';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  useToast,
} from '@/components/ui';
import { readDraft } from '@/lib/message-drafts';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './thread-list.module.css';

/**
 * One inbox across every team. Rows show status by priority (Failed, Unread, Draft, Muted,
 * Archived) with words and icons, never colour alone; hover or focus reveals Pin, Mark read, Mute
 * and Archive. Keyboard: arrows move, Enter opens, `/` searches, `c` composes.
 */
export function ThreadList({ onCompose }: { onCompose?: () => void }) {
  const { contexts, userId } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const teams = messagingTeams(contexts);
  const playerOnly = isPlayerOnly(contexts);
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useLoad(
    () =>
      teams.length === 0
        ? Promise.resolve({ data: [], error: null })
        : getInboxAll(getClient()),
    [teams.length],
  );
  const { reload } = list;
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotifications(getClient(), userId, reload);
  }, [userId, reload]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const rows = useMemo(() => sortInbox((list.data ?? []).map(inboxRowFromDb)), [list.data]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const idsKey = rows.map((r) => r.threadId).join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    const next: Record<string, string> = {};
    for (const id of ids) {
      const d = readDraft(id);
      if (d) next[id] = d;
    }
    // Reading localStorage is an external system; the list re-reads when its rows change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(next);
  }, [idsKey, pathname]);

  const [filter, setFilter] = useState<InboxFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [muteFor, setMuteFor] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  type Hit = {
    thread_id: string;
    message_id: string;
    snippet: string;
    team_name: string;
    sender_name: string | null;
  };
  const [settled, setSettled] = useState<{ query: string; hits: Hit[] }>({ query: '', hits: [] });
  const trimmed = query.trim();
  const serverSearch = shouldSearchServer(query);
  useEffect(() => {
    if (!serverSearch) return;
    let live = true;
    const id = setTimeout(() => {
      void searchMessages(getClient(), trimmed).then((r) => {
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

  const visible = useMemo(() => {
    const filtered = filterInbox(rows, filter);
    return trimmed ? searchInbox(filtered, trimmed, userId) : filtered;
  }, [rows, filter, trimmed, userId]);
  const featured = filter.kind === 'all' && !trimmed ? featuredAnnouncement(rows) : null;
  const pinned = visible.filter((r) => r.pinnedAt && r.threadId !== featured?.threadId);
  const rest = visible.filter((r) => !r.pinnedAt && r.threadId !== featured?.threadId);
  const ordered = [...(featured ? [featured] : []), ...pinned, ...rest];
  const showTeam = showTeamChip(teams.length, playerOnly);

  const act = async (fn: () => PromiseLike<{ error: unknown }>, done?: string) => {
    const res = await fn();
    if (res.error) toast(friendlyError(res.error as never), 'danger');
    else if (done) toast(done);
    reload();
  };

  // Keyboard: arrows move between rows, Enter opens (native link), `/` focuses search, `c` composes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === 'c' && onCompose) {
        e.preventDefault();
        onCompose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const links = [...document.querySelectorAll<HTMLElement>('[data-testid="thread-row"]')];
        if (links.length === 0) return;
        e.preventDefault();
        const i = links.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? Math.min(links.length - 1, i + 1) : Math.max(0, i - 1);
        links[i === -1 ? 0 : next]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCompose]);

  if (teams.length === 0) {
    return (
      <EmptyState
        icon="chat-circle"
        title="Messages live inside each team"
        body="Join a team to see its conversations."
      />
    );
  }

  const renderRow = (r: InboxRow) => {
    const selected = pathname === `/messages/${r.threadId}`;
    const title = threadTitle(r);
    const draft = drafts[r.threadId] ?? null;
    const status = rowStatus(r, { hasFailed: false, draft, inArchivedFilter: filter.kind === 'archived' });
    const muted = isMuted(r.mutedUntil);
    const preview = status === 'draft' && draft ? draftPreview(draft) : inboxPreview(r, userId);
    const label = [
      title,
      showTeam ? r.teamName : null,
      r.unreadCount > 0 ? `${r.unreadCount} unread` : null,
      status === 'muted' ? 'muted' : null,
      status === 'draft' ? 'draft' : null,
      preview,
      r.lastCreatedAt ? listTimeLabel(r.lastCreatedAt) : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <li key={r.threadId} className={styles.item}>
        <Link
          href={`/messages/${r.threadId}`}
          className={`${styles.row} ${selected ? styles.selected : ''}`}
          aria-current={selected ? 'page' : undefined}
          aria-label={label}
          data-testid="thread-row"
        >
          <span className={r.type === 'direct' ? undefined : `${styles.avatar} ${r.type === 'announcement' ? styles.lime : ''}`}>
            {r.type === 'direct' ? (
              <Avatar name={title} size="lg" />
            ) : (
              <Icon
                name={r.type === 'announcement' ? 'megaphone' : 'users-three'}
                weight={r.type === 'announcement' ? 'fill' : 'regular'}
              />
            )}
          </span>
          <span className={styles.text}>
            <span className={styles.titleLine}>
              <span className={`${styles.title} ${status === 'unread' ? styles.bold : ''}`}>{title}</span>
              {showTeam ? <span className={styles.team}>{r.teamName}</span> : null}
              {r.pinnedAt ? <Icon name="push-pin" size="sm" label="Pinned" /> : null}
            </span>
            <span className={styles.preview}>
              {status === 'muted' ? <Icon name="bell-slash" size="sm" label="Muted" /> : null}
              {status === 'archived' ? <Icon name="archive-box" size="sm" label="Archived" /> : null}
              <span className={status === 'unread' ? styles.bold : undefined}>{preview}</span>
            </span>
          </span>
          <span className={styles.side}>
            {r.lastCreatedAt ? <span className={styles.time}>{listTimeLabel(r.lastCreatedAt)}</span> : null}
            {r.unreadCount > 0 ? (
              <span
                className={`${styles.count} ${muted ? styles.quiet : ''}`}
                role="img"
                aria-label={`${r.unreadCount} unread`}
                data-testid="unread-dot"
              >
                {r.unreadCount}
              </span>
            ) : null}
          </span>
        </Link>
        <span className={styles.actions} role="group" aria-label={`Actions for ${title}`}>
          <button
            type="button"
            aria-label={r.pinnedAt ? 'Unpin' : 'Pin'}
            title={r.pinnedAt ? 'Unpin' : 'Pin'}
            onClick={() => void act(() => setThreadPinned(getClient(), r.threadId, !r.pinnedAt))}
          >
            <Icon name="push-pin" size="sm" />
          </button>
          {r.unreadCount > 0 && r.lastMessageId ? (
            <button
              type="button"
              aria-label="Mark read"
              title="Mark read"
              onClick={() => void act(() => markThreadRead(getClient(), r.threadId, r.lastMessageId as string))}
            >
              <Icon name="check" size="sm" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
            onClick={() => (muted ? void act(() => setThreadMute(getClient(), r.threadId, null)) : setMuteFor(muteFor === r.threadId ? null : r.threadId))}
          >
            <Icon name="bell-slash" size="sm" />
          </button>
          <button
            type="button"
            aria-label={r.archivedForMe ? 'Move to inbox' : 'Archive'}
            title={r.archivedForMe ? 'Move to inbox' : 'Archive'}
            onClick={() =>
              void act(
                () => setThreadArchivedForMe(getClient(), r.threadId, !r.archivedForMe),
                r.archivedForMe ? 'Moved back to your inbox' : 'Archived until the next message',
              )
            }
          >
            <Icon name="archive-box" size="sm" />
          </button>
        </span>
        {muteFor === r.threadId ? (
          <ul className={styles.menu} aria-label="Mute for">
            {MUTE_DURATIONS.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => {
                    setMuteFor(null);
                    void act(() => setThreadMute(getClient(), r.threadId, muteUntil(d)));
                  }}
                >
                  {muteDurationLabel(d)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  let body;
  if (list.loading && !list.data) body = <LoadingSkeleton />;
  else if (list.error && !list.data) body = <ErrorState message="Can’t load messages" onRetry={reload} />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon="chat-circle"
        title="No conversations yet"
        body="Start a conversation with your team."
      />
    );
  else if (ordered.length === 0 && hits.length === 0 && !searching)
    body = (
      <EmptyState icon="magnifying-glass" title="No results" body={trimmed ? `Nothing matches “${trimmed}”.` : 'Nothing here.'} />
    );
  else
    body = (
      <>
        <ul className={styles.list} aria-label="Conversations">
          {featured ? <li className={styles.sectionLabel}>Announcement</li> : null}
          {featured ? renderRow(featured) : null}
          {pinned.length ? <li className={styles.sectionLabel}>Pinned</li> : null}
          {pinned.map(renderRow)}
          {pinned.length && rest.length ? <li className={styles.sectionLabel}>All messages</li> : null}
          {rest.map(renderRow)}
        </ul>
        {serverSearch ? (
          <section aria-label="In messages" className={styles.hits}>
            <Text variant="label" muted as="h3">
              In messages
            </Text>
            {searching ? <Text muted>Searching…</Text> : null}
            {hits.map((h) => (
              <button
                key={h.message_id}
                type="button"
                className={styles.hit}
                onClick={() => router.push(`/messages/${h.thread_id}?message=${h.message_id}`)}
              >
                <span className={styles.team}>
                  {h.sender_name ?? 'Someone'} · {h.team_name}
                </span>
                <span>{h.snippet}</span>
              </button>
            ))}
          </section>
        ) : null}
      </>
    );

  return (
    <div className={styles.column}>
      <label className={styles.search}>
        <Icon name="magnifying-glass" size="sm" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search conversations and people"
          aria-label="Search conversations and people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {showFilterChips(playerOnly) ? (
        <div className={styles.chips} role="group" aria-label="Filter conversations">
          <Chip selected={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
            All
          </Chip>
          <Chip selected={filter.kind === 'unread'} onClick={() => setFilter(filter.kind === 'unread' ? { kind: 'all' } : { kind: 'unread' })}>
            Unread
          </Chip>
          <Chip selected={filter.kind === 'announcements'} onClick={() => setFilter(filter.kind === 'announcements' ? { kind: 'all' } : { kind: 'announcements' })}>
            Announcements
          </Chip>
          {teams.length >= 2
            ? teams.map((t) => (
                <Chip
                  key={t.id}
                  selected={filter.kind === 'team' && filter.teamId === t.id}
                  onClick={() => setFilter(filter.kind === 'team' && filter.teamId === t.id ? { kind: 'all' } : { kind: 'team', teamId: t.id })}
                >
                  {t.title}
                </Chip>
              ))
            : null}
          <Chip selected={filter.kind === 'archived'} onClick={() => setFilter(filter.kind === 'archived' ? { kind: 'all' } : { kind: 'archived' })}>
            Archived
          </Chip>
        </div>
      ) : null}
      {list.error && list.data ? <Text variant="caption" muted>Showing saved messages. You may be offline.</Text> : null}
      {body}
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <Text variant="heading" as="h2">
          Keyboard shortcuts
        </Text>
        <dl className={styles.shortcuts}>
          {[
            ['↑ ↓', 'Move between conversations'],
            ['Enter', 'Open the conversation'],
            ['/', 'Search'],
            ['c', 'New message'],
            ['Esc', 'Close the info panel'],
            ['Enter / Shift+Enter', 'Send / new line in a message'],
            ['?', 'Show this list'],
          ].map(([k, d]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}

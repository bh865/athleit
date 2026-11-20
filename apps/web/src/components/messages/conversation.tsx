'use client';

import {
  deliveryStatus,
  friendlyError,
  groupMessages,
  joinedLateNotice,
  memberCountLabel,
  newMessagesDividerIndex,
  type ChatMessage,
  isTeamStaff,
} from '@athleit/core';
import {
  deleteMessage,
  getMyParticipation,
  hideMessage,
  reportMessage,
  toggleReaction,
  setActiveThread,
} from '@athleit/db/api';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import {
  Button,
  EmptyState,
  ErrorState,
  Glass,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';
import { currentEndpoint } from '@/lib/web-push';

import { Bubble } from './bubble';
import { Composer } from './composer';
import styles from './conversation.module.css';
import { ThreadInfoPanel } from './thread-info-panel';
import { useThread } from './use-thread';

const NEAR_BOTTOM = 80;

export function Conversation({ threadId }: { threadId: string }) {
  const { userId, contexts } = useApp();
  const me = userId ?? '';
  const t = useThread(threadId, me);
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showPill, setShowPill] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const infoOpener = useRef<HTMLButtonElement>(null);

  const isStaff = t.thread ? isTeamStaff(contexts, t.thread.team_id) : false;
  const isAnnouncement = t.thread?.type === 'announcement';
  const archived = Boolean(t.thread?.archived_at);
  const canPost = isAnnouncement ? isStaff : true;
  const teamRoles = contexts.find((c) => c.kind === 'team' && c.id === t.thread?.team_id)?.roles ?? [];
  const canManage = isStaff && (isAnnouncement || teamRoles.includes('admin') || t.thread?.created_by === me);
  const mine0 = useLoad(() => getMyParticipation(getClient(), threadId, me), [threadId, me]);
  const joinedLate =
    !isAnnouncement && joinedLateNotice(isStaff, mine0.data?.joined_at ?? null, t.thread?.created_at ?? null);
  const teamCount = contexts.filter((c) => c.kind === 'team').length;
  const teamTitle = teamCount > 1 ? (contexts.find((c) => c.kind === 'team' && c.id === t.thread?.team_id)?.title ?? '') : '';
  // The last-read marker as it was when the conversation opened (it moves as we read).
  const [openedReadAt, setOpenedReadAt] = useState<string | null | undefined>(undefined);
  if (openedReadAt === undefined && t.state === 'ready') {
    setOpenedReadAt(t.reads.find((r) => r.profile_id === me)?.last_read_at ?? null);
  }

  const items = useMemo(() => groupMessages(t.messages, me), [t.messages, me]);
  const dividerKey = useMemo(() => {
    if (openedReadAt === undefined) return null;
    const i = newMessagesDividerIndex(t.messages, openedReadAt, me);
    return i < 0 ? null : t.messages[i]!.id;
  }, [t.messages, openedReadAt, me]);
  const byId = useMemo(() => new Map(t.messages.map((m) => [m.id, m])), [t.messages]);
  const othersRead = useMemo(
    () => t.reads.filter((r) => r.profile_id !== me).map((r) => r.last_read_at),
    [t.reads, me],
  );
  const title =
    t.thread?.title ?? [...t.names.entries()].find(([id]) => id !== me)?.[1] ?? 'Message';

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // While this conversation is open, tell the delivery worker so this browser is not buzzed for it.
  useEffect(() => {
    let stop = false;
    let token: string | null = null;
    const beat = async () => {
      token ??= await currentEndpoint();
      if (token && !stop && document.visibilityState === 'visible')
        await setActiveThread(getClient(), token, threadId);
    };
    void beat();
    const timer = setInterval(() => void beat(), 15_000);
    return () => {
      stop = true;
      clearInterval(timer);
      if (token) void setActiveThread(getClient(), token, null);
    };
  }, [threadId]);

  // Stay pinned to the newest message unless the reader scrolled up.
  const count = t.messages.length;
  useEffect(() => {
    if (t.state !== 'ready') return;
    if (atBottom.current) {
      scrollToBottom();
      void t.markRead();
    } else if (t.incoming > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a live arrival
      setShowPill(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on arrival, not on every hook change
  }, [count, t.state]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM * 6);
    if (atBottom.current && showPill) {
      setShowPill(false);
      void t.markRead();
    }
    if (el.scrollTop < NEAR_BOTTOM && t.hasMore && !t.loadingOlder) {
      const before = el.scrollHeight;
      void t.loadOlder().then(() => {
        requestAnimationFrame(() => {
          if (scroller.current)
            scroller.current.scrollTop += scroller.current.scrollHeight - before;
        });
      });
    }
  };

  const act = async (
    fn: () => PromiseLike<{ error: { message: string; code?: string | undefined } | null }>,
    ok?: string,
  ) => {
    const r = await fn();
    if (r.error) toast(friendlyError(r.error), 'danger');
    else if (ok) toast(ok);
    void t.refetchLatest();
  };

  if (t.state === 'loading') {
    return (
      <div className={styles.conversation} aria-busy="true">
        <LoadingSkeleton />
      </div>
    );
  }
  if (t.state === 'error') {
    return (
      <div className={styles.conversation}>
        <ErrorState message={t.error ?? 'Can’t load messages'} onRetry={() => void t.load()} />
      </div>
    );
  }

  return (
    <section className={styles.conversation} aria-label={`Conversation: ${title}`}>
      <Glass as="header" level="bar" className={styles.header}>
        <Link href="/messages" className={styles.back} aria-label="Back to messages">
          <Icon name="caret-left" />
        </Link>
        <button
          ref={infoOpener}
          type="button"
          className={styles.titleBlock}
          aria-label={`${title}. ${infoOpen ? 'Close' : 'Open'} conversation info`}
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
        >
          <Text variant="bodyBold" className={styles.title}>
            {title}
          </Text>
          <Text variant="caption" muted>
            {t.typing.length > 0
              ? 'typing…'
              : isAnnouncement
                ? 'Announcements'
                : `${teamTitle ? `${teamTitle} · ` : ''}${memberCountLabel(t.memberCount)}`}
          </Text>
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="Conversation info"
          aria-expanded={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
        >
          <Icon name="info" />
        </button>
      </Glass>

      <div
        ref={scroller}
        className={styles.scroller}
        onScroll={onScroll}
        data-testid="message-scroller"
      >
        {t.loadingOlder ? (
          <Text variant="caption" muted className={styles.older}>
            Loading earlier messages…
          </Text>
        ) : null}
        {items.length === 0 ? (
          <EmptyState
            icon="chat-circle"
            title="No messages yet"
            body={canPost ? 'Say hello to get things started.' : 'Announcements will show up here.'}
          />
        ) : (
          <ol className={styles.list} aria-label="Messages">
            {items.map((it) => [
              it.kind === 'message' && it.message.id === dividerKey ? (
                <li key="new-divider" className={styles.divider} aria-label="New messages">
                  <Text variant="caption">New messages</Text>
                </li>
              ) : null,
              it.kind === 'day' ? (
                <li key={it.key} className={styles.day}>
                  <Text variant="caption" muted>
                    {it.label}
                  </Text>
                </li>
              ) : isAnnouncement ? (
                <AnnouncementPost
                  key={it.key}
                  message={it.message}
                  readCount={t.reads.length}
                  showReads={isStaff}
                />
              ) : (
                <Bubble
                  key={it.key}
                  message={it.message}
                  own={it.own}
                  firstInRun={it.firstInRun}
                  lastInRun={it.lastInRun}
                  status={it.own && it.lastInRun ? deliveryStatus(it.message, othersRead) : null}
                  reactions={t.reactions[it.message.id] ?? []}
                  attachments={t.attachments[it.message.id] ?? []}
                  quoted={it.message.replyToId ? (byId.get(it.message.replyToId) ?? null) : null}
                  myId={me}
                  canModerate={isStaff}
                  onReact={(e) => void act(() => toggleReaction(getClient(), it.message.id, e))}
                  onReply={() => setReplyTo(it.message)}
                  onReport={() => setReporting(it.message)}
                  onHide={() =>
                    void act(
                      () => hideMessage(getClient(), it.message.id, 'Removed by staff'),
                      'Message removed',
                    )
                  }
                  onDelete={() =>
                    void act(() => deleteMessage(getClient(), it.message.id), 'Message deleted')
                  }
                  onRetry={() => void t.retry(it.message.clientId ?? it.message.id)}
                  onDiscard={() => t.discard(it.message.clientId ?? it.message.id)}
                />
              ),
            ])}
          </ol>
        )}
        {t.typing.length > 0 ? (
          <div
            className={styles.typing}
            role="status"
            aria-label={`${t.names.get(t.typing[0]!) ?? 'Someone'} is typing`}
          >
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>

      {showPill || scrolledUp ? (
        <Glass
          as="button"
          type="button"
          level="sheet"
          className={styles.pill}
          onClick={() => {
            scrollToBottom(true);
            setShowPill(false);
            void t.markRead();
          }}
        >
          <Icon name="arrow-down" size="sm" /> {showPill ? 'New messages' : 'Jump to latest'}
        </Glass>
      ) : null}

      {joinedLate ? (
        <Text variant="caption" muted className={styles.notice}>
          You joined this conversation after it started, so you see messages from when you joined.
        </Text>
      ) : null}
      {archived ? (
        <Text variant="caption" muted className={styles.notice}>
          {canManage
            ? 'This conversation is archived. Unarchive it from the info panel to reply.'
            : 'This conversation is archived.'}
        </Text>
      ) : canPost ? (
        <Composer
          threadId={threadId}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onTyping={t.notifyTyping}
          onUpload={t.upload}
          onSend={async (body, files) => {
            const err = await t.send(body, replyTo?.id ?? null, files);
            setReplyTo(null);
            requestAnimationFrame(() => scrollToBottom());
            return err;
          }}
        />
      ) : (
        <Text variant="caption" muted className={styles.notice}>
          Only coaches and managers can post here.
        </Text>
      )}

      {infoOpen ? (
        <ThreadInfoPanel
          threadId={threadId}
          onClose={() => {
            setInfoOpen(false);
            infoOpener.current?.focus();
          }}
        />
      ) : null}

      <Sheet open={reporting !== null} onClose={() => setReporting(null)} title="Report message">
        <Text variant="heading" as="h2">
          Report this message
        </Text>
        <Text muted as="p">
          Staff will review it. The sender isn’t told who reported it.
        </Text>
        <TextField
          label="What’s wrong?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
        <Button
          loading={busy}
          disabled={reason.trim().length === 0}
          onClick={async () => {
            if (!reporting) return;
            setBusy(true);
            const r = await reportMessage(getClient(), reporting.id, reason);
            setBusy(false);
            if (r.error) {
              toast(friendlyError(r.error), 'danger');
            } else {
              toast('Report sent');
              setReporting(null);
              setReason('');
            }
          }}
        >
          Send report
        </Button>
      </Sheet>
    </section>
  );
}

/** Announcements are calm posts on a surface card, not bubbles. */
function AnnouncementPost({
  message,
  readCount,
  showReads,
}: {
  message: ChatMessage;
  readCount: number;
  showReads: boolean;
}) {
  const removed = message.hidden || message.deleted;
  return (
    <li className={styles.post} data-testid="message">
      <Text variant="label" muted>
        ANNOUNCEMENT
      </Text>
      <p className={styles.postBody}>
        {message.hidden ? 'Removed by staff' : message.deleted ? 'Message deleted' : message.body}
      </p>
      <Text variant="caption" muted>
        {message.senderName ?? 'Staff'} ·{' '}
        {new Date(message.createdAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
        {showReads && !removed ? ` · ${readCount} read` : ''}
      </Text>
    </li>
  );
}

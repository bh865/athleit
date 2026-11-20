import {
  friendlyError,
  mergeMessages,
  retryDelayMs,
  type ChatMessage,
  type OutboxEntry,
} from '@athleit/core';
import {
  getMessage,
  getMessagesPage,
  getThread,
  getThreadMembers,
  getThreadReads,
  markThreadRead,
  sendMessage,
  subscribeToThread,
  uploadAttachment,
  type MessageRow,
  type ThreadSubscription,
} from '@athleit/db/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';

const PAGE = 30;
const TYPING_MS = 4000;
const outboxKey = (threadId: string) => `outbox.${threadId}`;

export interface Reaction {
  emoji: string;
  profileIds: string[];
}
export interface Attachment {
  id: string;
  path: string;
  mime: string;
  size: number;
}
export interface PendingFile {
  path: string;
  mime: string;
  size: number;
  name: string;
}
type Queued = OutboxEntry & { files: PendingFile[] };

function toChat(row: MessageRow, names: Map<string, string>): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_profile_id,
    senderName: row.sender_profile_id ? (names.get(row.sender_profile_id) ?? null) : null,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deleted: row.deleted_at !== null,
    hidden: row.hidden_at !== null,
    replyToId: row.reply_to_id,
  };
}
const reactionsOf = (rows: MessageRow[]) => {
  const out: Record<string, Reaction[]> = {};
  for (const r of rows) {
    const by = new Map<string, string[]>();
    for (const x of r.message_reactions ?? [])
      by.set(x.emoji, [...(by.get(x.emoji) ?? []), x.profile_id]);
    out[r.id] = [...by].map(([emoji, profileIds]) => ({ emoji, profileIds }));
  }
  return out;
};
const attachmentsOf = (rows: MessageRow[]) => {
  const out: Record<string, Attachment[]> = {};
  for (const r of rows)
    out[r.id] = (r.message_attachments ?? []).map((a) => ({
      id: a.id,
      path: a.storage_path,
      mime: a.mime_type,
      size: a.size_bytes,
    }));
  return out;
};
/** A network failure has no PostgREST error code; a rule violation always does. */
const isNetworkError = (e: { code?: string | undefined }) => !e.code;

/**
 * One open conversation on mobile: pages, live updates, optimistic send, typing, read state and
 * an OFFLINE QUEUE. Sends that fail because the network is down stay queued (persisted per
 * thread) and retry with backoff, on foreground, and after every Realtime reconnect. Before
 * retrying we check whether the earlier attempt actually landed, so a lost response does not
 * create a duplicate.
 */
export function useThread(threadId: string, myId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [reads, setReads] = useState<{ profile_id: string; last_read_at: string }[]>([]);
  const [thread, setThread] = useState<Awaited<ReturnType<typeof getThread>>['data']>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<string[]>([]);
  const [incoming, setIncoming] = useState(0);
  // Network is down (a send could not reach the server) and the server's rate limit answer.
  const [offline, setOffline] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const namesRef = useRef(names);
  const messagesRef = useRef(messages);
  const sub = useRef<ThreadSubscription | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const queue = useRef<Queued[]>([]);
  const flushing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    namesRef.current = names;
    messagesRef.current = messages;
  });

  const absorb = useCallback((rows: MessageRow[]) => {
    const chat = rows.map((r) => toChat(r, namesRef.current));
    setMessages((cur) => mergeMessages(cur, chat));
    setReactions((cur) => ({ ...cur, ...reactionsOf(rows) }));
    setAttachments((cur) => ({ ...cur, ...attachmentsOf(rows) }));
  }, []);

  const persist = useCallback(
    () => kv.set(outboxKey(threadId), JSON.stringify(queue.current)),
    [threadId],
  );

  const refreshReads = useCallback(async () => {
    const r = await getThreadReads(supabase, threadId);
    if (r.data) setReads(r.data);
  }, [threadId]);

  const refetchLatest = useCallback(async () => {
    const r = await getMessagesPage(supabase, threadId, { limit: PAGE });
    if (r.data) absorb(r.data);
    return r.data ?? null;
  }, [threadId, absorb]);

  const setSendState = (clientId: string, sendState: 'sending' | 'failed') =>
    setMessages((cur) => cur.map((m) => (m.clientId === clientId ? { ...m, sendState } : m)));

  /** Try to deliver the queue, oldest first. Stops at the first network failure and schedules a retry. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.length > 0) {
        const entry = queue.current[0]!;
        if (entry.attempts > 0) {
          // The previous attempt may have succeeded with the response lost: look for it first.
          const page = await refetchLatest();
          const landed = page?.find(
            (m) =>
              m.sender_profile_id === myId &&
              m.body === entry.body &&
              m.created_at >= entry.createdAt,
          );
          if (landed) {
            setMessages((cur) => cur.filter((m) => m.clientId !== entry.clientId));
            queue.current.shift();
            await persist();
            continue;
          }
        }
        setSendState(entry.clientId, 'sending');
        const res = await sendMessage(supabase, {
          threadId,
          body: entry.body,
          replyTo: entry.replyToId ?? null,
          attachments: entry.files.map((f) => ({
            storage_path: f.path,
            mime_type: f.mime,
            size_bytes: f.size,
          })),
        });
        if (res.error) {
          if (isNetworkError(res.error)) {
            setOffline(true);
            entry.attempts += 1;
            await persist();
            retryTimer.current = setTimeout(() => void flush(), retryDelayMs(entry.attempts));
            return;
          }
          // A rule said no (permissions, rate limit, archived): show Failed with Retry/Discard.
          setOffline(false);
          if (/rate_limited/.test(res.error.message)) {
            setRateLimited(true);
            setTimeout(() => setRateLimited(false), 20_000);
          }
          setSendState(entry.clientId, 'failed');
          queue.current.shift();
          failed.current.set(entry.clientId, entry);
          await persist();
          continue;
        }
        setOffline(false);
        const row = await getMessage(supabase, res.data);
        setMessages((cur) => cur.filter((m) => m.clientId !== entry.clientId));
        if (row.data) absorb([row.data]);
        queue.current.shift();
        await persist();
      }
    } finally {
      flushing.current = false;
    }
  }, [threadId, myId, absorb, refetchLatest, persist]);
  const failed = useRef(new Map<string, Queued>());

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    const [t, m, page, rd] = await Promise.all([
      getThread(supabase, threadId),
      getThreadMembers(supabase, threadId),
      getMessagesPage(supabase, threadId, { limit: PAGE }),
      getThreadReads(supabase, threadId),
    ]);
    if (t.error || page.error) {
      setError(friendlyError(t.error ?? page.error));
      setState('error');
      return;
    }
    const map = new Map((m.data ?? []).map((x) => [x.profile_id, x.display_name ?? 'Someone']));
    namesRef.current = map;
    setNames(map);
    setThread(t.data);
    setMemberCount(m.data?.length ?? 0);
    setReads(rd.data ?? []);
    const server = page.data.map((r) => toChat(r, map)).reverse();
    // Restore sends that were queued while offline (e.g. the app was closed).
    let restored: Queued[] = [];
    try {
      restored = JSON.parse((await kv.get(outboxKey(threadId))) ?? '[]') as Queued[];
    } catch {
      restored = [];
    }
    queue.current = restored;
    setMessages(
      mergeMessages(
        server,
        restored.map((q) => ({
          id: q.clientId,
          clientId: q.clientId,
          senderId: myId,
          senderName: 'You',
          body: q.body,
          createdAt: q.createdAt,
          replyToId: q.replyToId ?? null,
          sendState: 'sending' as const,
        })),
      ),
    );
    setReactions(reactionsOf(page.data));
    setAttachments(attachmentsOf(page.data));
    setHasMore(page.data.length === PAGE);
    setState('ready');
    if (restored.length > 0) void flush();
  }, [threadId, myId, flush]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch for this thread
    void load();
  }, [load]);

  useEffect(() => {
    if (state !== 'ready') return;
    const timers = typingTimers.current;
    const s = subscribeToThread(
      supabase,
      threadId,
      {
        onMessage: async (id) => {
          const r = await getMessage(supabase, id);
          if (r.data) {
            absorb([r.data]);
            if (r.data.sender_profile_id !== myId) setIncoming((n) => n + 1);
          }
        },
        onReaction: () => void refetchLatest(),
        onRead: () => void refreshReads(),
        onTyping: (who) => {
          setTyping((cur) => (cur.includes(who) ? cur : [...cur, who]));
          clearTimeout(timers.get(who));
          timers.set(
            who,
            setTimeout(() => setTyping((cur) => cur.filter((x) => x !== who)), TYPING_MS),
          );
        },
        // Every (re)connect: fetch what we missed (merge de-duplicates) and flush the queue.
        onStatus: (status) => {
          if (status === 'SUBSCRIBED') {
            void refetchLatest();
            void flush();
          }
        },
      },
      myId,
    );
    sub.current = s;
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        void refetchLatest();
        void flush();
      }
    });
    return () => {
      s.unsubscribe();
      app.remove();
      timers.forEach(clearTimeout);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [state, threadId, myId, absorb, refetchLatest, refreshReads, flush]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.sendState);
    if (!oldest || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const r = await getMessagesPage(supabase, threadId, {
      before: { createdAt: oldest.createdAt, id: oldest.id },
      limit: PAGE,
    });
    if (r.data) {
      absorb(r.data);
      setHasMore(r.data.length === PAGE);
    }
    setLoadingOlder(false);
  }, [threadId, absorb, loadingOlder, hasMore]);

  /**
   * Page back until the given message is loaded (used to open a search result in place). Gives up
   * after 10 pages, or when the thread has no earlier messages (a message from before the reader
   * joined is never returned, so it can never be found).
   */
  const loadUntil = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (messagesRef.current.some((m) => m.id === messageId)) return true;
      const cursor = messagesRef.current.find((m) => !m.sendState);
      let before = cursor ? { createdAt: cursor.createdAt, id: cursor.id } : null;
      for (let i = 0; i < 10 && before; i++) {
        const r = await getMessagesPage(supabase, threadId, { before, limit: PAGE });
        if (!r.data) return false;
        absorb(r.data);
        setHasMore(r.data.length === PAGE);
        if (r.data.some((m) => m.id === messageId)) return true;
        const oldest = r.data[r.data.length - 1];
        before =
          r.data.length === PAGE && oldest ? { createdAt: oldest.created_at, id: oldest.id } : null;
      }
      return false;
    },
    [threadId, absorb],
  );

  /** Optimistic: the bubble appears at once as "Sending" and is queued until delivered. */
  const send = useCallback(
    async (body: string, replyTo: string | null, files: PendingFile[]) => {
      const clientId = uuid();
      const createdAt = new Date().toISOString();
      setMessages((cur) => [
        ...cur,
        {
          id: clientId,
          clientId,
          senderId: myId,
          senderName: 'You',
          body,
          createdAt,
          replyToId: replyTo,
          sendState: 'sending',
        },
      ]);
      queue.current.push({
        clientId,
        threadId,
        body,
        replyToId: replyTo,
        createdAt,
        attempts: 0,
        files,
      });
      await persist();
      void flush();
    },
    [myId, threadId, persist, flush],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const entry = failed.current.get(clientId);
      if (!entry) return;
      failed.current.delete(clientId);
      entry.attempts = 0;
      queue.current.push(entry);
      await persist();
      void flush();
    },
    [persist, flush],
  );

  const discard = useCallback(
    (clientId: string) => {
      failed.current.delete(clientId);
      queue.current = queue.current.filter((q) => q.clientId !== clientId);
      void persist();
      setMessages((cur) => cur.filter((m) => m.clientId !== clientId));
    },
    [persist],
  );

  const upload = useCallback(
    async (uri: string, name: string, mime: string): Promise<PendingFile | { error: string }> => {
      const bytes = await (await fetch(uri)).arrayBuffer();
      const res = await uploadAttachment(supabase, threadId, bytes, name, mime);
      return res.error
        ? { error: friendlyError(res.error) }
        : { path: res.data, mime, size: bytes.byteLength, name };
    },
    [threadId],
  );

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sub.current?.sendTyping();
  }, []);

  const markRead = useCallback(async () => {
    const latest = [...messagesRef.current].reverse().find((m) => !m.sendState);
    if (latest) {
      await markThreadRead(supabase, threadId, latest.id);
      setIncoming(0);
    }
  }, [threadId]);

  return {
    thread,
    messages,
    reactions,
    attachments,
    names,
    reads,
    memberCount,
    state,
    error,
    hasMore,
    loadingOlder,
    typing,
    incoming,
    load,
    loadOlder,
    loadUntil,
    offline,
    rateLimited,
    send,
    retry,
    discard,
    upload,
    notifyTyping,
    markRead,
    refetchLatest,
  };
}

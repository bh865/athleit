'use client';

import { friendlyError, mergeMessages, type ChatMessage } from '@athleit/core';
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
  type Client,
  type MessageRow,
  type ThreadSubscription,
} from '@athleit/db/api';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getClient } from '@/lib/supabase/browser';

const PAGE = 30;
const TYPING_MS = 4000;

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

export function toChat(row: MessageRow, names: Map<string, string>): ChatMessage {
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

/** Everything one open conversation needs: pages, live updates, optimistic send, reads, typing. */
export function useThread(threadId: string, myId: string) {
  const client: Client = getClient();
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
  const namesRef = useRef(names);
  const messagesRef = useRef(messages);
  const sub = useRef<ThreadSubscription | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const pending = useRef(
    new Map<string, { body: string; replyTo: string | null; files: PendingFile[] }>(),
  );

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

  const refreshReads = useCallback(async () => {
    const r = await getThreadReads(client, threadId);
    if (r.data) setReads(r.data);
  }, [client, threadId]);

  const refetchLatest = useCallback(async () => {
    const r = await getMessagesPage(client, threadId, { limit: PAGE });
    if (r.data) absorb(r.data);
  }, [client, threadId, absorb]);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    const [t, m, page, rd] = await Promise.all([
      getThread(client, threadId),
      getThreadMembers(client, threadId),
      getMessagesPage(client, threadId, { limit: PAGE }),
      getThreadReads(client, threadId),
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
    setMessages(page.data.map((r) => toChat(r, map)).reverse());
    setReactions(reactionsOf(page.data));
    setAttachments(attachmentsOf(page.data));
    setHasMore(page.data.length === PAGE);
    setState('ready');
  }, [client, threadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch for this thread
    void load();
  }, [load]);

  useEffect(() => {
    if (state !== 'ready') return;
    const timers = typingTimers.current;
    const s = subscribeToThread(
      client,
      threadId,
      {
        onMessage: async (id) => {
          const r = await getMessage(client, id);
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
        // After every (re)connect, fetch what we missed; merge de-duplicates by id / clientId.
        onStatus: (status) => status === 'SUBSCRIBED' && void refetchLatest(),
      },
      myId,
    );
    sub.current = s;
    return () => {
      s.unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [state, client, threadId, myId, absorb, refetchLatest, refreshReads]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.sendState);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const r = await getMessagesPage(client, threadId, {
      before: { createdAt: oldest.createdAt, id: oldest.id },
      limit: PAGE,
    });
    if (r.data) {
      absorb(r.data);
      setHasMore(r.data.length === PAGE);
    }
    setLoadingOlder(false);
  }, [client, threadId, absorb, loadingOlder]);

  const doSend = useCallback(
    async (clientId: string, body: string, replyTo: string | null, files: PendingFile[]) => {
      const res = await sendMessage(client, {
        threadId,
        body,
        replyTo,
        attachments: files.map((f) => ({
          storage_path: f.path,
          mime_type: f.mime,
          size_bytes: f.size,
        })),
      });
      if (res.error) {
        setMessages((cur) =>
          cur.map((m) => (m.clientId === clientId ? { ...m, sendState: 'failed' as const } : m)),
        );
        return friendlyError(res.error);
      }
      const row = await getMessage(client, res.data);
      // Drop the optimistic copy, then merge the confirmed row (a realtime copy may already be here).
      setMessages((cur) => cur.filter((m) => m.clientId !== clientId));
      if (row.data) absorb([row.data]);
      return null;
    },
    [client, threadId, absorb],
  );

  /** Optimistic send; the bubble appears at once as "Sending" and becomes "Failed" with retry. */
  const send = useCallback(
    async (body: string, replyTo: string | null, files: PendingFile[]) => {
      const clientId = crypto.randomUUID();
      setMessages((cur) => [
        ...cur,
        {
          id: clientId,
          clientId,
          senderId: myId,
          senderName: 'You',
          body,
          createdAt: new Date().toISOString(),
          replyToId: replyTo,
          sendState: 'sending',
        },
      ]);
      pending.current.set(clientId, { body, replyTo, files });
      const err = await doSend(clientId, body, replyTo, files);
      if (!err) pending.current.delete(clientId);
      return err;
    },
    [doSend, myId],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const p = pending.current.get(clientId);
      if (!p) return;
      setMessages((cur) =>
        cur.map((m) => (m.clientId === clientId ? { ...m, sendState: 'sending' as const } : m)),
      );
      const err = await doSend(clientId, p.body, p.replyTo, p.files);
      if (!err) pending.current.delete(clientId);
    },
    [doSend],
  );

  const discard = useCallback((clientId: string) => {
    pending.current.delete(clientId);
    setMessages((cur) => cur.filter((m) => m.clientId !== clientId));
  }, []);

  const upload = useCallback(
    async (file: File): Promise<PendingFile | { error: string }> => {
      const res = await uploadAttachment(client, threadId, file, file.name, file.type);
      return res.error
        ? { error: friendlyError(res.error) }
        : { path: res.data, mime: file.type, size: file.size, name: file.name };
    },
    [client, threadId],
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
      await markThreadRead(client, threadId, latest.id);
      setIncoming(0);
    }
  }, [client, threadId]);

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
    send,
    retry,
    discard,
    upload,
    notifyTyping,
    markRead,
    refetchLatest,
  };
}

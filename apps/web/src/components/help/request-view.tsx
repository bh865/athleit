'use client';
import {
  getMySupportRequest,
  markSupportRead,
  markSupportSolved,
  rateSupportRequest,
  replyByToken,
  replyToSupportRequest,
  reopenSupportRequest,
  supportErrorCode,
  viewSupportRequestByToken,
  type MyRequest,
} from '@athleit/db/support';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, ErrorState, LoadingSkeleton, Text, TextArea } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

import styles from './help.module.css';
import { StatusChip, Thread } from './thread';

/** One request, by reference (signed in) or by emailed-link token (signed out, no account). */
export function RequestView({ refOrToken, mode }: { refOrToken: string; mode: 'ref' | 'token' }) {
  const supabase = useMemo(() => createClient(), []);
  const [req, setReq] = useState<MyRequest | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rated, setRated] = useState(false);

  const fetchReq = useCallback(async () => {
    if (mode === 'ref') {
      const r = await getMySupportRequest(supabase, refOrToken);
      if (!r.error) void markSupportRead(supabase, refOrToken);
      return r.error
        ? {
            state: (r.error.message.includes('unknown_request') ? 'missing' : 'error') as
              'missing' | 'error',
            req: null as MyRequest | null,
          }
        : { state: 'ready' as const, req: r.data as MyRequest | null };
    }
    const r = await viewSupportRequestByToken(supabase, refOrToken);
    return r.error
      ? {
          state: (r.error.message.includes('not_found') ? 'missing' : 'error') as
            'missing' | 'error',
          req: null as MyRequest | null,
        }
      : { state: 'ready' as const, req: r.data.request as MyRequest | null };
  }, [supabase, refOrToken, mode]);
  const load = useCallback(async () => {
    const r = await fetchReq();
    setReq(r.req);
    setState(r.state);
  }, [fetchReq]);
  useEffect(() => {
    let live = true;
    void fetchReq().then((r) => {
      if (!live) return;
      setReq(r.req);
      setState(r.state);
    });
    return () => {
      live = false;
    };
  }, [fetchReq]);

  async function act(fn: () => Promise<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.error) {
      const code = supportErrorCode(r.error);
      setMsg(
        code === 'rate_limited'
          ? 'You’re sending a lot of messages. Please wait a moment.'
          : code === 'request_closed'
            ? 'This request is closed. Start a new one and mention this reference.'
            : 'That didn’t go through. Your text is still here.',
      );
      return false;
    }
    if (ok) setMsg(ok);
    await load();
    return true;
  }

  if (state === 'loading') return <LoadingSkeleton />;
  if (state === 'missing')
    return (
      <div className={styles.card} role="alert">
        <strong>We can’t find that request</strong>
        <span className={styles.muted}>
          The link may have expired, or the reference may be wrong.
        </span>
        <Link className={styles.link} href="/help/contact">
          Contact support
        </Link>
      </div>
    );
  if (state === 'error' || !req)
    return <ErrorState message="We couldn’t load this request. Try again." />;

  return (
    <>
      <div className={styles.chips}>
        <span className={styles.mono}>{req.ref}</span>
        <StatusChip status={req.status} />
      </div>
      <h1>{req.subject}</h1>
      {req.held ? (
        <div className={styles.card} role="status">
          We’ve received your request and are checking it.
        </div>
      ) : null}
      {req.status === 'waiting_on_requester' ? (
        <div className={styles.card} role="status">
          <strong>Waiting on you</strong> We’ve asked a question below. Reply when you can.
        </div>
      ) : null}
      <Thread request={req} />
      <div role="status" aria-live="polite">
        {msg}
      </div>
      {req.can_reply ? (
        <form
          className={styles.vote}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void act(() =>
              mode === 'ref'
                ? replyToSupportRequest(supabase, req.ref, text.trim())
                : replyByToken(supabase, refOrToken, text.trim()),
            ).then((ok) => ok && setText(''));
          }}
        >
          <TextArea
            label="Reply"
            rows={4}
            maxLength={5000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" loading={busy}>
            Send reply
          </Button>
          {mode === 'ref' && req.status !== 'solved' ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void act(() => markSupportSolved(supabase, req.ref), 'Marked solved.')}
            >
              Mark as solved
            </Button>
          ) : null}
        </form>
      ) : null}
      {mode === 'ref' && req.status === 'solved' ? (
        <div className={styles.vote}>
          {req.can_reopen ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void act(() => reopenSupportRequest(supabase, req.ref), 'Reopened.')}
            >
              Reopen
            </Button>
          ) : null}
          {!req.satisfaction && !rated ? (
            <div>
              <Text variant="bodyBold" as="p">
                Was this resolved?
              </Text>
              <div className={styles.chips}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void act(
                      () => rateSupportRequest(supabase, req.ref, 'yes'),
                      'Thanks for telling us.',
                    ).then(() => setRated(true))
                  }
                >
                  Yes
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void act(
                      () => rateSupportRequest(supabase, req.ref, 'no'),
                      'Thanks. Reply above if it’s still not fixed.',
                    ).then(() => setRated(true))
                  }
                >
                  No
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {Object.keys(req.diagnostics).length ? (
        <details>
          <summary>Diagnostics we received</summary>
          <ul>
            {Object.entries(req.diagnostics).map(([k, v]) => (
              <li key={k}>
                <span className={styles.mono}>{k}</span>: {String(v)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

'use client';
import { canDo, type PlatformRole } from '@athleit/core';
import type { AdminSupportDetail, CannedReply } from '@athleit/db/support';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  assignAction,
  deleteAttachmentAction,
  linkArticleAction,
  mergeAction,
  priorityAction,
  redactAction,
  replyAction,
  signAttachmentAction,
  spamAction,
  statusAction,
  tagAction,
  releaseHoldAction,
} from '@/app/admin/support/actions';
import { Button, Select, Text, TextArea, TextField } from '@/components/ui';

import { ConfirmWrite } from '../confirm-write';

type Mode =
  | null
  | { kind: 'merge' }
  | { kind: 'spam' }
  | { kind: 'redact'; messageId: string }
  | { kind: 'attachment'; attachmentId: string };

/**
 * The conversation and its controls. Routine actions (reply, note, status, priority, assign, tags, link, release) run at once and are
 * recorded on the activity list. Merge, spam, redact and delete attachment open the confirm-with-reason sheet (admin, MFA, audited);
 * support-role users do not see those buttons at all. An internal note has a different surface and a lock, and its button says so.
 */
export function TicketWorkspace(p: {
  id: string;
  role: PlatformRole;
  myId: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  held: boolean;
  messages: AdminSupportDetail['messages'];
  attachments: AdminSupportDetail['attachments'];
  canned: CannedReply[];
  tags: string[];
  articleSlug: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState(false);
  const [text, setText] = useState('');
  const [next, setNext] = useState<'waiting_on_requester' | 'open' | 'solved'>(
    'waiting_on_requester',
  );
  const [shortcut, setShortcut] = useState('');
  const [tagText, setTagText] = useState(p.tags.join(', '));
  const [slug, setSlug] = useState(p.articleSlug ?? '');
  const [mergeTarget, setMergeTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const sensitive = canDo(p.role, 'support_merge');

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, done?: () => void) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setMsg(r.message ?? 'That didn’t go through.');
    done?.();
    router.refresh();
  }
  const matches = shortcut
    ? p.canned.filter(
        (c) =>
          c.shortcut.startsWith(shortcut.replace(/^\//, '')) ||
          c.title.toLowerCase().includes(shortcut.toLowerCase()),
      )
    : [];
  const closed = p.status === 'closed';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <ol
        aria-label="Conversation"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {p.messages.map((m) => (
          <li
            key={m.id}
            style={{
              padding: 'var(--space-3)',
              border: 'var(--size-card-border) solid var(--color-line)',
              borderRadius: 'var(--radius-md)',
              background: m.internal ? 'var(--color-surface-alt)' : 'var(--color-surface)',
            }}
          >
            <Text variant="caption" muted as="p">
              {m.internal ? '🔒 Internal note · ' : ''}
              {m.author_kind === 'requester'
                ? 'Requester'
                : m.author_kind === 'staff'
                  ? `${m.author_name ?? 'Staff'}`
                  : 'System'}{' '}
              · {new Date(m.created_at).toLocaleString()}
            </Text>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.body}</p>
            {sensitive && m.author_kind !== 'system' && !m.redacted ? (
              <Button variant="ghost" onClick={() => setMode({ kind: 'redact', messageId: m.id })}>
                Redact
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {p.attachments.length ? (
        <div>
          <Text variant="bodyBold" as="p">
            Attachments
          </Text>
          <Text variant="caption" muted as="p">
            Images may show children. Files download; they are never displayed on this page.
          </Text>
          <ul>
            {p.attachments.map((a) => (
              <li key={a.id}>
                {a.file_name}{' '}
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(async () => {
                      const r = await signAttachmentAction(a.id);
                      if (r.ok) window.open(r.data, '_blank', 'noopener,noreferrer');
                      return r;
                    })
                  }
                >
                  Download
                </Button>
                {sensitive ? (
                  <Button
                    variant="ghost"
                    onClick={() => setMode({ kind: 'attachment', attachmentId: a.id })}
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.held ? (
        <div role="status">
          This request is held for review, so public replies are off.{' '}
          <Button variant="secondary" onClick={() => void run(() => releaseHoldAction(p.id))}>
            Release hold
          </Button>
        </div>
      ) : null}
      {!closed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void run(
              () => replyAction(p.id, text.trim(), note, note ? null : next),
              () => setText(''),
            );
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: 'var(--size-card-border) solid var(--color-line)',
            background: note ? 'var(--color-surface-alt)' : 'var(--color-surface)',
          }}
        >
          <div
            role="group"
            aria-label="Reply mode"
            style={{ display: 'flex', gap: 'var(--space-2)' }}
          >
            <Button
              type="button"
              variant={note ? 'ghost' : 'primary'}
              onClick={() => setNote(false)}
            >
              Public reply
            </Button>
            <Button
              type="button"
              variant={note ? 'primary' : 'ghost'}
              onClick={() => setNote(true)}
            >
              🔒 Internal note
            </Button>
          </div>
          {p.canned.length && !note ? (
            <div>
              <TextField
                label="Canned reply (type a shortcut or title)"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
              />
              {matches.length ? (
                <ul>
                  {matches.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setText((t) => (t ? `${t}\n\n${c.body}` : c.body));
                          setShortcut('');
                        }}
                      >
                        {c.title} <code>/{c.shortcut}</code>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <TextArea
            label={note ? 'Internal note (only staff see this)' : 'Reply to the requester'}
            rows={5}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
          />
          {!note ? (
            <Select
              label="After sending, set status to"
              value={next}
              onChange={(e) => setNext(e.target.value as typeof next)}
              options={[
                { value: 'waiting_on_requester', label: 'Waiting on requester' },
                { value: 'open', label: 'Open' },
                { value: 'solved', label: 'Solved' },
              ]}
            />
          ) : null}
          <Button type="submit" loading={busy} disabled={p.held && !note}>
            {note ? 'Add internal note' : 'Send reply'}
          </Button>
        </form>
      ) : null}
      <div role="status" aria-live="polite">
        {msg}
      </div>
      {!closed ? (
        <fieldset style={{ border: 'none', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          <legend>Work this ticket</legend>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void run(() => assignAction(p.id, p.myId))}>
              Assign to me
            </Button>
            <Button variant="ghost" onClick={() => void run(() => assignAction(p.id, null))}>
              Unassign
            </Button>
            <Button variant="ghost" onClick={() => void run(() => statusAction(p.id, 'solved'))}>
              Mark solved
            </Button>
          </div>
          <Select
            label="Priority"
            value={p.priority}
            onChange={(e) =>
              void run(() => priorityAction(p.id, e.target.value as typeof p.priority))
            }
            options={['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v }))}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                tagAction(
                  p.id,
                  tagText
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                ),
              );
            }}
          >
            <TextField
              label="Tags (comma separated)"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
            <Button type="submit" variant="ghost">
              Save tags
            </Button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => linkArticleAction(p.id, slug.trim() || null));
            }}
          >
            <TextField
              label="Linked article (slug)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <Button type="submit" variant="ghost">
              Link article
            </Button>
          </form>
        </fieldset>
      ) : null}
      {sensitive ? (
        <fieldset style={{ border: 'none', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
          <legend>Needs a reason and MFA (audited)</legend>
          <TextField
            label="Merge into ticket id"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            hint="Paste the id from the other ticket’s address."
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              disabled={!/^[0-9a-f-]{36}$/i.test(mergeTarget)}
              onClick={() => setMode({ kind: 'merge' })}
            >
              Merge duplicate
            </Button>
            <Button variant="secondary" onClick={() => setMode({ kind: 'spam' })}>
              Mark as spam
            </Button>
          </div>
        </fieldset>
      ) : null}
      <ConfirmWrite
        open={mode?.kind === 'merge'}
        onClose={() => setMode(null)}
        title="Merge duplicate ticket"
        onDone={() => router.push('/admin/support/tickets')}
        rows={[
          { label: 'This ticket', before: 'Open', after: 'Closed and linked to the other ticket' },
        ]}
        impact="This ticket is closed and linked to the target. This is written to the platform audit log."
        onSubmit={(why) => mergeAction(p.id, mergeTarget, why)}
      />
      <ConfirmWrite
        open={mode?.kind === 'spam'}
        onClose={() => setMode(null)}
        title="Mark as spam"
        onDone={() => router.refresh()}
        rows={[{ label: 'This ticket', before: 'Visible in the queue', after: 'Spam and closed' }]}
        impact="The ticket leaves the normal queue. This is written to the platform audit log."
        onSubmit={(why) => spamAction(p.id, why)}
      />
      <ConfirmWrite
        open={mode?.kind === 'redact'}
        onClose={() => setMode(null)}
        title="Redact message"
        confirmLabel="Redact"
        onDone={() => router.refresh()}
        rows={[{ label: 'Message text', before: 'Shown', after: '[removed by Athleit Support]' }]}
        impact="The text is replaced and not kept anywhere. Who redacted it and why is kept in the audit log."
        onSubmit={(why) => redactAction(p.id, mode?.kind === 'redact' ? mode.messageId : '', why)}
      />
      <ConfirmWrite
        open={mode?.kind === 'attachment'}
        onClose={() => setMode(null)}
        title="Delete attachment"
        confirmLabel="Delete"
        onDone={() => router.refresh()}
        rows={[{ label: 'Attachment', before: 'Stored', after: 'Deleted' }]}
        impact="The file is deleted permanently. This is written to the platform audit log."
        onSubmit={(why) =>
          deleteAttachmentAction(p.id, mode?.kind === 'attachment' ? mode.attachmentId : '', why)
        }
      />
    </section>
  );
}

'use client';
// A support conversation: our messages and yours, system lines, attachments and a reply box. Shared by the signed-in request
// page and the signed-out emailed-link page. Text is always rendered as plain text (never HTML), auto-linked safely.
import type { MyRequest, SupportMessage } from '@athleit/db/support';
import { Fragment, type ReactNode } from 'react';

import styles from './help.module.css';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
/** Plain text with safe auto-linking: rel="noopener nofollow", http(s) only. */
export function Linkified({ text }: { text: string }): ReactNode {
  return text.split(URL_RE).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} rel="noopener nofollow" target="_blank">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const STATUS_LABEL = {
  open: 'Open',
  waiting_on_requester: 'Waiting on you',
  solved: 'Solved',
  closed: 'Closed',
} as const;
export const statusLabel = (s: keyof typeof STATUS_LABEL) => STATUS_LABEL[s];
const STATUS_MARK = { open: '●', waiting_on_requester: '▲', solved: '✓', closed: '■' } as const;
/** Shape plus word, never colour alone. */
export function StatusChip({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={styles.mono}>
      <span aria-hidden="true">{STATUS_MARK[status]}</span> {STATUS_LABEL[status]}
    </span>
  );
}

function Bubble({ m, attachments }: { m: SupportMessage; attachments: MyRequest['attachments'] }) {
  if (m.author_kind === 'system')
    return <li className={`${styles.mono} ${styles.muted}`}>{m.body}</li>;
  const mine = m.author_kind === 'requester';
  const mine_files = attachments.filter((a) => a.message_id === m.id);
  return (
    <li className={styles.card}>
      <strong>{mine ? 'You' : `${m.author_name ?? 'Support'}, Athleit Support`}</strong>
      <span className={styles.mono}>{new Date(m.created_at).toLocaleString()}</span>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
        <Linkified text={m.body} />
      </p>
      {mine_files.length ? (
        <span className={styles.muted}>
          Attached: {mine_files.map((a) => a.file_name).join(', ')}
        </span>
      ) : null}
    </li>
  );
}

export function Thread({ request }: { request: MyRequest }) {
  return (
    <ol className={styles.list} style={{ listStyle: 'none', padding: 0 }} aria-label="Conversation">
      {request.messages.map((m) => (
        <Bubble key={m.id} m={m} attachments={request.attachments} />
      ))}
    </ol>
  );
}

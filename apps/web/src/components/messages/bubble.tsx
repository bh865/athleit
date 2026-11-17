'use client';

import { messageA11yLabel, timeLabel, type ChatMessage, type DeliveryStatus } from '@athleit/core';
import { REACTIONS } from '@athleit/core';
import type { IconName } from '@athleit/ui-core';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { getAttachmentUrl } from '@athleit/db/api';

import styles from './bubble.module.css';
import type { Attachment, Reaction } from './use-thread';

export const REACTION_ICON: Record<(typeof REACTIONS)[number], IconName> = {
  thumbs_up: 'thumbs-up',
  heart: 'heart',
  laugh: 'smiley',
  celebrate: 'confetti',
  clap: 'hands-clapping',
  wow: 'star',
};
const REACTION_LABEL: Record<string, string> = {
  thumbs_up: 'Thumbs up',
  heart: 'Heart',
  laugh: 'Laugh',
  celebrate: 'Celebrate',
  clap: 'Clap',
  wow: 'Wow',
};

function AttachmentView({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getAttachmentUrl(getClient(), a.path).then((r) => live && r.data && setUrl(r.data));
    return () => {
      live = false;
    };
  }, [a.path]);
  const name = a.path.split('/').pop() ?? 'file';
  if (a.mime.startsWith('image/')) {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL, size fixed by CSS
      <img src={url} alt={name} className={styles.image} />
    ) : (
      <span className={styles.imagePlaceholder} aria-hidden />
    );
  }
  return (
    <a className={styles.pdf} href={url ?? undefined} target="_blank" rel="noreferrer">
      <Icon name="file-pdf" />
      <span className={styles.pdfName}>{name}</span>
    </a>
  );
}

export interface BubbleProps {
  message: ChatMessage;
  own: boolean;
  firstInRun: boolean;
  lastInRun: boolean;
  status: DeliveryStatus | null;
  reactions: Reaction[];
  attachments: Attachment[];
  quoted: ChatMessage | null;
  myId: string;
  canModerate: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onReport: () => void;
  onHide: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

/** One chat bubble with its meta line, reactions and hover/focus actions. */
export function Bubble(p: BubbleProps) {
  const { message: m, own } = p;
  const removed = m.hidden || m.deleted;
  const time = timeLabel(new Date(m.createdAt));
  const failed = m.sendState === 'failed';
  return (
    <li
      className={`${styles.row} ${own ? styles.own : styles.other}`}
      aria-label={messageA11yLabel({ message: m, own }, p.status)}
      data-testid="message"
    >
      {!own && p.firstInRun ? (
        <span className={styles.sender}>{m.senderName ?? 'Someone'}</span>
      ) : null}
      <div className={styles.line}>
        <div
          className={[
            styles.bubble,
            removed ? styles.removed : '',
            p.lastInRun ? (own ? styles.tailOwn : styles.tailOther) : '',
            m.sendState === 'sending' ? styles.sending : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {p.quoted && !removed ? (
            <div className={styles.quote}>
              <span className={styles.quoteName}>{p.quoted.senderName ?? 'Someone'}</span>
              <span className={styles.quoteBody}>{p.quoted.body || 'Attachment'}</span>
            </div>
          ) : null}
          {m.hidden ? (
            <em>Removed by staff</em>
          ) : m.deleted ? (
            <em>Message deleted</em>
          ) : (
            <>
              {m.body ? <span className={styles.text}>{m.body}</span> : null}
              {p.attachments.map((a) => (
                <AttachmentView key={a.id} a={a} />
              ))}
            </>
          )}
          {p.reactions.length > 0 && !removed ? (
            <span className={styles.reactions}>
              {p.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={styles.chip}
                  aria-label={`${REACTION_LABEL[r.emoji] ?? r.emoji}, ${r.profileIds.length}${r.profileIds.includes(p.myId) ? ', you reacted' : ''}`}
                  aria-pressed={r.profileIds.includes(p.myId)}
                  onClick={() => p.onReact(r.emoji)}
                >
                  <Icon
                    name={REACTION_ICON[r.emoji as keyof typeof REACTION_ICON] ?? 'heart'}
                    weight="fill"
                    size="sm"
                  />
                  <span className="t-mono-sm">{r.profileIds.length}</span>
                </button>
              ))}
            </span>
          ) : null}
        </div>
        {!removed && !m.sendState ? (
          <span className={styles.actions} role="group" aria-label="Message actions">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className={styles.action}
                aria-label={`React: ${REACTION_LABEL[e]}`}
                onClick={() => p.onReact(e)}
              >
                <Icon name={REACTION_ICON[e]} size="sm" />
              </button>
            ))}
            <button type="button" className={styles.action} aria-label="Reply" onClick={p.onReply}>
              <Icon name="arrow-bend-up-left" size="sm" />
            </button>
            {!own ? (
              <button
                type="button"
                className={styles.action}
                aria-label="Report"
                onClick={p.onReport}
              >
                <Icon name="flag" size="sm" />
              </button>
            ) : (
              <button
                type="button"
                className={styles.action}
                aria-label="Delete"
                onClick={p.onDelete}
              >
                <Icon name="trash" size="sm" />
              </button>
            )}
            {p.canModerate && !own ? (
              <button
                type="button"
                className={styles.action}
                aria-label="Remove for everyone"
                onClick={p.onHide}
              >
                <Icon name="eye-slash" size="sm" />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {p.lastInRun || failed ? (
        <span className={styles.meta}>
          {failed ? (
            <>
              <span role="alert">Failed to send</span>
              <button type="button" className={styles.link} onClick={p.onRetry}>
                Retry
              </button>
              <button type="button" className={styles.link} onClick={p.onDiscard}>
                Discard
              </button>
            </>
          ) : (
            <>
              {time}
              {own && p.status ? ` · ${p.status}` : ''}
              {m.editedAt ? ' · Edited' : ''}
            </>
          )}
        </span>
      ) : null}
    </li>
  );
}

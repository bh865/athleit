'use client';

import {
  ATTACHMENT_LIMITS_TEXT,
  ATTACHMENT_MIME_TYPES,
  attachmentProblemText,
  characterCounter,
  MAX_MESSAGE_LENGTH,
  validateAttachment,
  type ChatMessage,
} from '@athleit/core';
import { useEffect, useRef, useState } from 'react';

import { Glass, Icon, Text } from '@/components/ui';
import { readDraft, writeDraft } from '@/lib/message-drafts';

import styles from './composer.module.css';
import type { PendingFile } from './use-thread';

/** Glass sheet pill: paperclip, text, lime send button. Enter sends, Shift+Enter adds a line. */
export function Composer({
  threadId,
  replyTo,
  onClearReply,
  onTyping,
  onUpload,
  onSend,
}: {
  threadId: string;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onTyping: () => void;
  onUpload: (file: File) => Promise<PendingFile | { error: string }>;
  onSend: (body: string, files: PendingFile[]) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Local draft per conversation (this browser only); it also feeds the inbox "Draft:" prefix.
  const loaded = useRef(false);
  useEffect(() => {
    const d = readDraft(threadId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage on open
    if (d) setText((cur) => cur || d);
    loaded.current = true;
  }, [threadId]);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => writeDraft(threadId, text), 400);
    return () => clearTimeout(id);
  }, [text, threadId]);
  const counter = characterCounter(text.length);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const over = text.length > MAX_MESSAGE_LENGTH;
  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading && !over;

  const submit = async () => {
    if (!canSend) return;
    const body = text.trim();
    const attach = files;
    setText('');
    writeDraft(threadId, '');
    setFiles([]);
    setError(null);
    input.current?.focus();
    const err = await onSend(body, attach);
    if (err) setError(err);
  };

  const pick = async (list: FileList | File[] | null) => {
    if (!list) return;
    setError(null);
    let count = files.length;
    for (const f of Array.from(list)) {
      const problem = validateAttachment({ type: f.type, size: f.size }, count);
      if (problem) {
        setError(attachmentProblemText(problem));
        continue;
      }
      setUploading(true);
      const res = await onUpload(f);
      setUploading(false);
      if ('error' in res) setError(res.error);
      else {
        count += 1;
        setFiles((cur) => [...cur, res]);
      }
    }
    if (picker.current) picker.current.value = '';
  };

  return (
    <div
      className={`${styles.wrap} ${dragging ? styles.dragging : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void pick(e.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className={styles.drop} role="status">
          Drop to attach. {ATTACHMENT_LIMITS_TEXT}
        </div>
      ) : null}
      {replyTo ? (
        <div className={styles.reply}>
          <Text variant="caption" muted>
            Replying to {replyTo.senderName ?? 'message'}: {replyTo.body.slice(0, 60)}
          </Text>
          <button
            type="button"
            className={styles.clear}
            aria-label="Cancel reply"
            onClick={onClearReply}
          >
            <Icon name="x" size="sm" />
          </button>
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul className={styles.files} aria-label="Attachments">
          {files.map((f) => (
            <li key={f.path} className={styles.file}>
              <Icon name={f.mime === 'application/pdf' ? 'file-pdf' : 'camera'} size="sm" />
              <span className={styles.fileName}>{f.name}</span>
              <button
                type="button"
                className={styles.clear}
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((cur) => cur.filter((x) => x.path !== f.path))}
              >
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <Text variant="caption" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}
      <Glass level="sheet" className={styles.pill}>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept={ATTACHMENT_MIME_TYPES.join(',')}
          data-testid="attach-input"
          onChange={(e) => void pick(e.target.files)}
        />
        <button
          type="button"
          className={styles.clip}
          aria-label="Attach a file"
          onClick={() => picker.current?.click()}
        >
          <Icon name="paperclip" />
        </button>
        <textarea
          ref={input}
          className={styles.input}
          aria-label="Message"
          placeholder="Message"
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.length > 0) {
              e.preventDefault();
              void pick(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          className={styles.send}
          aria-label="Send message"
          disabled={!canSend}
          onClick={() => void submit()}
        >
          <Icon name="arrow-up" weight="fill" />
        </button>
      </Glass>
      <Text variant="caption" muted className={styles.hint}>
        {counter !== null ? (
          <span role="status" aria-live="polite">
            {counter < 0 ? `${-counter} over the limit` : `${counter} left`} ·{' '}
          </span>
        ) : null}
        Enter to send, Shift+Enter for a new line
      </Text>
    </div>
  );
}

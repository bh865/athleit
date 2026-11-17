'use client';

import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  type ChatMessage,
} from '@athleit/core';
import { useRef, useState } from 'react';

import { Glass, Icon, Text } from '@/components/ui';

import styles from './composer.module.css';
import type { PendingFile } from './use-thread';

/** Glass sheet pill: paperclip, text, lime send button. Enter sends, Shift+Enter adds a line. */
export function Composer({
  replyTo,
  onClearReply,
  onTyping,
  onUpload,
  onSend,
}: {
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
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading;

  const submit = async () => {
    if (!canSend) return;
    const body = text.trim();
    const attach = files;
    setText('');
    setFiles([]);
    setError(null);
    input.current?.focus();
    const err = await onSend(body, attach);
    if (err) setError(err);
  };

  const pick = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    for (const f of Array.from(list)) {
      if (files.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
      if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type)) {
        setError('Attach an image or a PDF.');
        continue;
      }
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError('That file is over 10 MB.');
        continue;
      }
      setUploading(true);
      const res = await onUpload(f);
      setUploading(false);
      if ('error' in res) setError(res.error);
      else setFiles((cur) => [...cur, res]);
    }
    if (picker.current) picker.current.value = '';
  };

  return (
    <div className={styles.wrap}>
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
          maxLength={MAX_MESSAGE_LENGTH}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
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
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Button, Text } from '@/components/ui';
import { env } from '@/env';

import styles from './help.module.css';

type State = 'ask' | 'comment' | 'done' | 'error';

/** "Was this helpful?" Yes records at once; No opens an optional one-line comment and a way to contact support with the article carried in. */
export function ArticleFeedback({ slug }: { slug: string }) {
  const [state, setState] = useState<State>('ask');
  const [comment, setComment] = useState('');
  const headingRef = useRef<HTMLParagraphElement>(null);

  async function send(helpful: boolean, text?: string) {
    try {
      const res = await fetch(`${env.url}/functions/v1/record-article-feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: env.anonKey },
        body: JSON.stringify({ kind: 'vote', slug, helpful, comment: text }),
      });
      if (!res.ok) throw new Error('failed');
      setState(helpful ? 'done' : text !== undefined ? 'done' : 'comment');
    } catch {
      setState('error');
    }
    queueMicrotask(() => headingRef.current?.focus());
  }

  return (
    <section className={styles.vote} aria-labelledby="helpful-q">
      <Text id="helpful-q" variant="bodyBold" as="p" ref={headingRef as never} tabIndex={-1}>
        {state === 'done' ? 'Thanks for telling us.' : 'Was this helpful?'}
      </Text>
      {state === 'ask' ? (
        <div className={styles.chips}>
          <Button variant="secondary" onClick={() => void send(true)}>
            Yes
          </Button>
          <Button variant="secondary" onClick={() => void send(false)}>
            No
          </Button>
        </div>
      ) : null}
      {state === 'comment' ? (
        <form
          className={styles.chips}
          onSubmit={(e) => {
            e.preventDefault();
            void send(false, comment);
          }}
        >
          <label htmlFor="what-was-missing">What was missing? (optional)</label>
          <input
            id="what-was-missing"
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={styles.searchInput}
          />
          <Button type="submit">Send</Button>
        </form>
      ) : null}
      {state === 'error' ? (
        <Text role="alert" as="p">
          We couldn’t save that. Try again later.
        </Text>
      ) : null}
      {state === 'comment' || state === 'done' ? (
        <Link className={styles.link} href={`/help/contact?article=${encodeURIComponent(slug)}`}>
          Contact support about this article
        </Link>
      ) : null}
    </section>
  );
}

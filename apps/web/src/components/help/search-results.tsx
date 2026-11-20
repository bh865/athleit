'use client';
import Link from 'next/link';
import { useEffect } from 'react';

import { env } from '@/env';

import styles from './help.module.css';
import { useDocsSearch, type SearchDoc } from './search-box';

export function SearchResults({ docs, q }: { docs: SearchDoc[]; q: string }) {
  const results = useDocsSearch(docs, q);
  const none = q.trim().length >= 2 && results.length === 0;
  // A no-result search is logged without any personal data; the server drops email-like text.
  useEffect(() => {
    if (!none) return;
    void fetch(`${env.url}/functions/v1/record-article-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: env.anonKey },
      body: JSON.stringify({ kind: 'miss', query: q }),
    }).catch(() => undefined);
  }, [none, q]);

  if (q.trim().length < 2)
    return <p className={styles.muted}>Type at least two letters to search.</p>;
  if (none)
    return (
      <div className={styles.card} role="status">
        <strong>We couldn’t find that</strong>
        <span className={styles.muted}>
          Check the spelling or try fewer words. Or tell us what you need.
        </span>
        <Link className={styles.link} href={`/help/contact?q=${encodeURIComponent(q)}`}>
          Contact support
        </Link>
      </div>
    );
  return (
    <ul className={styles.list} aria-label={`${results.length} results`}>
      {results.map((r) => (
        <li key={r.id}>
          <Link className={styles.item} href={`/help/a/${r.slug}`}>
            <strong>{String(r.title)}</strong>
            <span className={styles.muted}>{String(r.summary)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

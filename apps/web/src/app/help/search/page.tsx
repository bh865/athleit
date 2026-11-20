import { AUDIENCE_LABEL, HELP_AUDIENCES, type HelpAudience } from '@athleit/core';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/help/help.module.css';
import { SearchResults } from '@/components/help/search-results';
import { Heading, Text } from '@/components/ui';
import { articlesFor, searchDocs } from '@/lib/help/content';

export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; audience?: string }>;
}) {
  const { q = '', audience } = await searchParams;
  const aud = HELP_AUDIENCES.includes(audience as HelpAudience) ? (audience as HelpAudience) : null;
  return (
    <>
      <Heading level="title">
        {aud ? `Help for ${AUDIENCE_LABEL[aud].toLowerCase()}s` : 'Search results'}
      </Heading>
      {aud ? (
        <ul className={styles.list}>
          {articlesFor(aud).map((a) => (
            <li key={a.slug}>
              <Link className={styles.item} href={`/help/a/${a.slug}`}>
                <Text variant="bodyBold">{a.title}</Text>
                <Text muted>{a.summary}</Text>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <SearchResults docs={searchDocs()} q={q.slice(0, 100)} />
      )}
    </>
  );
}

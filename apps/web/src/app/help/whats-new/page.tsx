import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/help/help.module.css';
import { Heading, Text } from '@/components/ui';
import { loadWhatsNew } from '@/lib/help/whats-new';

export const metadata: Metadata = {
  title: 'What’s new',
  alternates: { canonical: '/help/whats-new' },
};

export default function WhatsNewPage() {
  const items = loadWhatsNew();
  return (
    <>
      <Heading level="title">What’s new</Heading>
      {items.length ? (
        <ul className={styles.list}>
          {items.map((e) => (
            <li key={`${e.date}-${e.title}`} className={styles.item}>
              <span className={styles.mono}>{e.date}</span>
              <Text variant="bodyBold">{e.title}</Text>
              <Text muted>{e.summary}</Text>
              {e.article ? (
                <Link className={styles.link} href={`/help/a/${e.article}`}>
                  Read more
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Text as="p" muted>
          Nothing to show yet. Product changes will be listed here.
        </Text>
      )}
    </>
  );
}

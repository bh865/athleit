import { helpCategory, HELP_CATEGORIES } from '@athleit/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import styles from '@/components/help/help.module.css';
import { Heading, Text } from '@/components/ui';
import { articlesIn } from '@/lib/help/content';

export const dynamicParams = false;
export const generateStaticParams = () => HELP_CATEGORIES.map((c) => ({ category: c.slug }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const c = helpCategory((await params).category);
  return c
    ? { title: c.title, description: c.description, alternates: { canonical: `/help/c/${c.slug}` } }
    : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const c = helpCategory((await params).category);
  if (!c) notFound();
  const list = articlesIn(c.slug);
  return (
    <>
      <nav aria-label="Breadcrumb">
        <Link className={styles.link} href="/help">
          Help
        </Link>{' '}
        / {c.title}
      </nav>
      <Heading level="title">{c.title}</Heading>
      <Text as="p" muted>
        {c.description}
      </Text>
      {list.length ? (
        <ul className={styles.list}>
          {list.map((a) => (
            <li key={a.slug}>
              <Link className={styles.item} href={`/help/a/${a.slug}`}>
                <Text variant="bodyBold">{a.title}</Text>
                <Text muted>{a.summary}</Text>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Text as="p">
          There are no articles here yet.{' '}
          <Link className={styles.link} href="/help/contact">
            Contact support
          </Link>{' '}
          and we’ll help.
        </Text>
      )}
    </>
  );
}

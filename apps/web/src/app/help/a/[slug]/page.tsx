import { AUDIENCE_LABEL, helpCategory } from '@athleit/core';
import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleFeedback } from '@/components/help/article-feedback';
import styles from '@/components/help/help.module.css';
import { mdxComponents } from '@/components/help/mdx';
import { ChipLabel, Heading, Text } from '@/components/ui';
import { allArticles, getArticle } from '@/lib/help/content';

export const dynamicParams = false;
export const generateStaticParams = () => allArticles().map((a) => ({ slug: a.slug }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return a
    ? { title: a.title, description: a.summary, alternates: { canonical: `/help/a/${a.slug}` } }
    : {};
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const cat = helpCategory(a.category)!;
  const headings = [...a.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
  const related = a.related.map((s) => getArticle(s)).filter(Boolean);
  return (
    <>
      <nav aria-label="Breadcrumb">
        <Link className={styles.link} href="/help">
          Help
        </Link>{' '}
        /{' '}
        <Link className={styles.link} href={`/help/c/${cat.slug}`}>
          {cat.title}
        </Link>
      </nav>
      <div className={styles.layout}>
        <article>
          <Heading level="title">{a.title}</Heading>
          <Text as="p" muted>
            {a.summary}
          </Text>
          <div className={styles.chips}>
            {a.audience.map((x) => (
              <ChipLabel key={x}>{AUDIENCE_LABEL[x]}</ChipLabel>
            ))}
            {(a.platforms ?? []).map((p) => (
              <ChipLabel key={p}>
                {p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'Web'}
              </ChipLabel>
            ))}
            <span className={styles.mono}>Last verified {a.verified_at}</span>
          </div>
          <div className={styles.prose}>
            <MDXRemote
              source={a.body}
              components={{
                ...mdxComponents,
                h2: ({ children }) => <h2 id={slugify(String(children))}>{children}</h2>,
                a: ({ href = '', children }) =>
                  href.startsWith('/') ? (
                    <Link href={href}>{children}</Link>
                  ) : (
                    <a href={href} rel="noopener nofollow">
                      {children}
                    </a>
                  ),
              }}
            />
          </div>
        </article>
        {headings.length > 1 ? (
          <nav className={styles.toc} aria-label="On this page">
            <Text variant="bodyBold">On this page</Text>
            {headings.map((h) => (
              <a key={h} className={styles.link} href={`#${slugify(h)}`}>
                {h}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      {related.length ? (
        <section aria-labelledby="related">
          <Heading as="h2" id="related">
            Related articles
          </Heading>
          <ul className={styles.list}>
            {related.map((r) => (
              <li key={r!.slug}>
                <Link className={styles.item} href={`/help/a/${r!.slug}`}>
                  <Text variant="bodyBold">{r!.title}</Text>
                  <Text muted>{r!.summary}</Text>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ArticleFeedback slug={a.slug} />
      <Text as="p" muted className={styles.mono}>
        Updated on {a.verified_at}
      </Text>
    </>
  );
}

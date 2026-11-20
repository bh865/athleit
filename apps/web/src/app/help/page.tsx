import { AUDIENCE_LABEL, HELP_AUDIENCES } from '@athleit/core';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/help/help.module.css';
import { ChipLabel, Heading, Text } from '@/components/ui';
import { categoriesWithArticles, recentlyUpdated } from '@/lib/help/content';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Help', alternates: { canonical: '/help' } };

const AUDIENCE_CARD = [
  { aud: 'parent', title: 'Parents and players', text: 'Joining, schedules, payments and safety.' },
  { aud: 'coach', title: 'Coaches and managers', text: 'Running a team day to day.' },
  { aud: 'team-admin', title: 'Team admins', text: 'Payouts, the subscription and settings.' },
  { aud: 'club-admin', title: 'Clubs', text: 'Linking teams to your club.' },
] as const;

export default async function HelpHome() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const cats = categoriesWithArticles().filter((c) => c.count > 0);
  return (
    <>
      <section className={styles.hero}>
        <Heading level="title">How can we help?</Heading>
        <Text as="p" muted>
          Search above, or browse by topic. Press / to search.
        </Text>
        {!signedIn ? (
          <Text as="p" muted>
            Need help with your account?{' '}
            <Link className={styles.link} href="/sign-in?next=/help">
              Sign in
            </Link>{' '}
            for your requests.
          </Text>
        ) : null}
      </section>
      <section aria-labelledby="who">
        <Heading as="h2" id="who">
          Who are you?
        </Heading>
        <div className={styles.grid}>
          {AUDIENCE_CARD.map((c) => (
            <Link key={c.aud} className={styles.card} href={`/help/search?audience=${c.aud}`}>
              <Text variant="bodyBold">{c.title}</Text>
              <Text muted>{c.text}</Text>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="topics">
        <Heading as="h2" id="topics">
          Topics
        </Heading>
        <div className={styles.grid}>
          {cats.map((c) => (
            <Link key={c.slug} className={styles.card} href={`/help/c/${c.slug}`}>
              <Text variant="bodyBold">{c.title}</Text>
              <Text muted>{c.description}</Text>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="new">
        <Heading as="h2" id="new">
          New and updated
        </Heading>
        <ul className={styles.list}>
          {recentlyUpdated().map((a) => (
            <li key={a.slug}>
              <Link className={styles.item} href={`/help/a/${a.slug}`}>
                <Text variant="bodyBold">{a.title}</Text>
                <Text muted>{a.summary}</Text>
                <span className={styles.mono}>Updated {a.verified_at}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.card} aria-labelledby="contact">
        <Heading as="h2" id="contact">
          Can’t find it?
        </Heading>
        <Text as="p" muted>
          Tell us what you need and a person will reply.
        </Text>
        <Link className={styles.link} href="/help/contact">
          Contact support
        </Link>
        {signedIn ? (
          <Link className={styles.link} href="/help/requests">
            Your requests
          </Link>
        ) : null}
      </section>
      <div hidden>
        {HELP_AUDIENCES.map((a) => (
          <ChipLabel key={a}>{AUDIENCE_LABEL[a]}</ChipLabel>
        ))}
      </div>
    </>
  );
}

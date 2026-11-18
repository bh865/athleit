import { registrationPriceLabel, infoBlocksSchema } from '@athleit/core';
import { fetchPublicRegistration } from '@athleit/db/registration';
import type { Metadata } from 'next';
import Link from 'next/link';

import { InfoBlocks } from '@/components/registration/info-blocks';
import { RegisterFlow } from '@/components/registration/register-flow';
import styles from '@/components/registration/registration.module.css';
import { SharePanel } from '@/components/registration/share-panel';
import { Badge, Card, Heading, Logo, Text } from '@/components/ui';
import { env } from '@/env';
import { createClient } from '@/lib/supabase/server';

const SPOT_LABEL: Record<string, string> = {
  open: 'Spots available',
  few: 'Only a few spots left',
  waitlist: 'Full: join the waitlist',
  full: 'Full',
};

async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return fetchPublicRegistration(
    { url: env.url, anonKey: env.anonKey },
    slug,
    data.session?.access_token ?? null,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ev = await load(slug);
  if (!ev) return { title: 'Registration', robots: { index: false, follow: false } };
  const description =
    ev.summary ?? `Register for ${ev.title}${ev.issuer_name ? ` with ${ev.issuer_name}` : ''}.`;
  return {
    title: `${ev.title} · Register`,
    description,
    // Link-only and members-only pages must never be indexed; public ones may.
    robots: ev.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: ev.title,
      description,
      type: 'website',
      ...(ev.cover_url ? { images: [{ url: ev.cover_url }] } : {}),
    },
    twitter: {
      card: ev.cover_url ? 'summary_large_image' : 'summary',
      title: ev.title,
      description,
    },
  };
}

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ev = await load(slug);
  if (!ev)
    return (
      <main className={styles.page}>
        <Logo variant="lockup" size="md" />
        <Card>
          <div className={styles.stack}>
            <Heading as="h1">We couldn’t find that registration</Heading>
            <Text as="p" muted>
              The link may be wrong, or this page is only for members. If you are a member, sign in
              and open the link again.
            </Text>
            <Link href={`/sign-in?next=${encodeURIComponent(`/r/${slug}`)}`}>Sign in</Link>
          </div>
        </Card>
      </main>
    );
  const blocks = infoBlocksSchema.safeParse(ev.info_blocks);
  const facts = [
    ev.starts_on ? { label: 'Starts', value: ev.starts_on } : null,
    ev.location_text ? { label: 'Where', value: ev.location_text } : null,
    { label: 'Price', value: registrationPriceLabel(ev.price_cents) },
    ev.closes_at
      ? {
          label: 'Closes',
          value: new Date(ev.closes_at).toLocaleDateString('en-US', { dateStyle: 'medium' }),
        }
      : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <main className={styles.page}>
      <Logo variant="lockup" size="md" />
      {ev.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ev.cover_url} alt="" className={styles.cover} />
      ) : null}
      <div className={`${styles.stack} ${styles.tight}`}>
        {ev.issuer_name ? (
          <Text variant="label" muted>
            {ev.issuer_name}
          </Text>
        ) : null}
        <Heading as="h1" level="title">
          {ev.title}
        </Heading>
        {ev.summary ? (
          <Text as="p" muted>
            {ev.summary}
          </Text>
        ) : null}
        <div className={styles.row}>
          <Badge tone={ev.state === 'open' ? 'success' : 'warning'}>
            {ev.state === 'open'
              ? (SPOT_LABEL[ev.spots] ?? 'Open')
              : ev.state === 'upcoming'
                ? 'Opens soon'
                : 'Closed'}
          </Badge>
        </div>
      </div>
      <dl className={styles.factGrid}>
        {facts.map((f) => (
          <div key={f.label} className={styles.fact}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {blocks.success ? <InfoBlocks blocks={blocks.data} /> : null}
      {ev.state === 'open' && ev.spots !== 'full' ? (
        <RegisterFlow event={ev} />
      ) : (
        <Card>
          <Text as="p" role="status">
            {ev.state === 'upcoming'
              ? `Registration opens ${ev.opens_at ? new Date(ev.opens_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'soon'}.`
              : ev.state === 'closed'
                ? 'Registration is closed.'
                : 'This event is full.'}
            {ev.contact_email ? ` Questions? ${ev.contact_email}` : ''}
          </Text>
        </Card>
      )}
      <Card>
        <div className={styles.stack}>
          <Heading as="h2">Share this page</Heading>
          <SharePanel path={`/r/${ev.slug}`} title={ev.title} />
        </div>
      </Card>
    </main>
  );
}

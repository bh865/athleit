import { space } from '@athleit/tokens';
import { getMySupportRequests } from '@athleit/db/support';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H2, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, ListGroup, ListRow, Text, TextField } from '@/components/ui';
import { articleUrl, loadHelpIndex, searchDocs, type HelpDoc } from '@/lib/help';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

// A short, fixed list of the most useful articles (slugs from apps/web/content/help). Titles come from the fetched index.
const POPULAR = [
  'join-a-team-with-a-code-or-link',
  'pay-a-request-and-see-your-receipt',
  'rsvp-and-see-the-schedule',
  'report-a-message',
];
const AUDIENCES = [
  {
    label: 'Parents and players',
    slugs: [
      'join-a-team-with-a-code-or-link',
      'link-your-child-to-your-family',
      'rsvp-and-see-the-schedule',
    ],
  },
  { label: 'Coaches and managers', slugs: ['rsvp-and-see-the-schedule', 'report-a-message'] },
  {
    label: 'Team admins',
    slugs: [
      'start-your-teams-free-trial',
      'set-up-payments-for-your-team',
      'update-your-card-or-cancel',
    ],
  },
];

export default function HelpHub() {
  useScreenTitle('Help and support');
  const router = useRouter();
  const [docs, setDocs] = useState<HelpDoc[] | null>(null);
  const [stale, setStale] = useState(false);
  const [q, setQ] = useState('');
  const [aud, setAud] = useState<number | null>(null);
  const reqs = useLoad(() => getMySupportRequests(supabase, { limit: 1 }), []);

  useEffect(() => {
    let live = true;
    void loadHelpIndex().then((r) => {
      if (!live) return;
      setDocs(r?.docs ?? []);
      setStale(r?.stale ?? false);
    });
    return () => {
      live = false;
    };
  }, []);

  const open = (slug: string) => void WebBrowser.openBrowserAsync(articleUrl(slug));
  const results = docs ? searchDocs(docs, q) : [];
  const titled = (slugs: string[]) =>
    slugs.map((s) => docs?.find((d) => d.slug === s)).filter((d): d is HelpDoc => !!d);
  const unread = reqs.data?.unread_count ?? 0;

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        {docs && docs.length === 0 ? (
          <Notice>
            You’re offline. Help articles need a connection, but you can still contact support.
          </Notice>
        ) : null}
        {stale ? <Notice>Showing the last articles saved on this phone.</Notice> : null}
        <TextField
          label="Search help"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {q.trim().length >= 2 ? (
          results.length ? (
            <ListGroup>
              {results.map((d, i) => (
                <ListRow
                  key={d.slug}
                  title={d.title}
                  subtitle={d.summary}
                  last={i === results.length - 1}
                  onPress={() => open(d.slug)}
                />
              ))}
            </ListGroup>
          ) : docs && docs.length ? (
            <View style={{ gap: space[2] }}>
              <Text variant="bodyBold">We couldn’t find that</Text>
              <Text muted>Check the spelling or try fewer words. Or tell us what you need.</Text>
              <Button
                title="Contact support"
                onPress={() => router.push({ pathname: '/help/contact', params: { q } } as never)}
              />
            </View>
          ) : null
        ) : (
          <>
            <H2>Who are you?</H2>
            <ListGroup>
              {AUDIENCES.map((a, i) => (
                <ListRow
                  key={a.label}
                  title={a.label}
                  last={i === AUDIENCES.length - 1}
                  onPress={() => setAud(aud === i ? null : i)}
                />
              ))}
            </ListGroup>
            {aud !== null ? (
              <ListGroup>
                {titled(AUDIENCES[aud]!.slugs).map((d, i, arr) => (
                  <ListRow
                    key={d.slug}
                    title={d.title}
                    subtitle={d.summary}
                    last={i === arr.length - 1}
                    onPress={() => open(d.slug)}
                  />
                ))}
              </ListGroup>
            ) : null}
            <H2>Popular</H2>
            <ListGroup>
              {titled(POPULAR).map((d, i, arr) => (
                <ListRow
                  key={d.slug}
                  title={d.title}
                  last={i === arr.length - 1}
                  onPress={() => open(d.slug)}
                />
              ))}
            </ListGroup>
          </>
        )}
        <ListGroup>
          <ListRow
            title="Contact support"
            subtitle="Send us a question or an idea"
            onPress={() => router.push('/help/contact' as never)}
          />
          <ListRow
            title="Your requests"
            subtitle={unread ? `${unread} with a new reply` : 'See replies and follow up'}
            last
            onPress={() => router.push('/help/requests' as never)}
          />
        </ListGroup>
      </View>
    </AppScreen>
  );
}

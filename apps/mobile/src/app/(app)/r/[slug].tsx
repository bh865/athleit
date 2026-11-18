import { fetchPublicRegistration, type PublicRegistration } from '@athleit/db/registration';
import { registrationPriceLabel } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Badge, H1 } from '@/components/app/kit';
import { InfoBlocksView, parseBlocks, RegisterFlow } from '@/components/registration/register-flow';
import { SharePanel } from '@/components/registration/share-panel';
import { Card, EmptyState, ErrorState, LoadingSkeleton, Text } from '@/components/ui';
import { accessToken, edgeConfig } from '@/lib/registration';

/** Opens from a shared link (https://…/r/<slug>), a QR code or the Registrations list. */
export default function RegistrationPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [state, setState] = useState<{
    ev: PublicRegistration | null;
    done: boolean;
    error: boolean;
  }>({ ev: null, done: false, error: false });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const ev = await fetchPublicRegistration(edgeConfig, slug, await accessToken());
        if (live) setState({ ev, done: true, error: false });
      } catch {
        if (live) setState({ ev: null, done: true, error: true });
      }
    })();
    return () => {
      live = false;
    };
  }, [slug]);
  const { ev } = state;
  return (
    <AppScreen>
      {!state.done ? (
        <LoadingSkeleton />
      ) : state.error ? (
        <ErrorState message="We couldn’t load this registration." />
      ) : !ev ? (
        <EmptyState title="We couldn’t find that registration. The link may be wrong, or it may be for members only." />
      ) : (
        <View style={{ gap: space[4] }}>
          <View style={{ gap: space[2] }}>
            {ev.issuer_name ? (
              <Text variant="label" muted>
                {ev.issuer_name}
              </Text>
            ) : null}
            <H1>{ev.title}</H1>
            {ev.summary ? <Text muted>{ev.summary}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <Badge tone={ev.state === 'open' ? 'success' : 'warning'}>
                {ev.state === 'open'
                  ? ev.spots === 'few'
                    ? 'Only a few spots left'
                    : ev.spots === 'waitlist'
                      ? 'Full: join the waitlist'
                      : ev.spots === 'full'
                        ? 'Full'
                        : 'Spots available'
                  : ev.state === 'upcoming'
                    ? 'Opens soon'
                    : 'Closed'}
              </Badge>
              <Text>{registrationPriceLabel(ev.price_cents)}</Text>
            </View>
          </View>
          <InfoBlocksView blocks={parseBlocks(ev.info_blocks)} />
          {ev.state === 'open' && ev.spots !== 'full' ? (
            <RegisterFlow event={ev} />
          ) : (
            <Card>
              <Text>
                {ev.state === 'upcoming'
                  ? 'Registration has not opened yet.'
                  : ev.state === 'closed'
                    ? 'Registration is closed.'
                    : 'This event is full.'}
                {ev.contact_email ? ` Questions? ${ev.contact_email}` : ''}
              </Text>
            </Card>
          )}
          <Card style={{ gap: space[3] }}>
            <Text variant="heading">Share this page</Text>
            <SharePanel slug={ev.slug} title={ev.title} />
          </Card>
        </View>
      )}
    </AppScreen>
  );
}

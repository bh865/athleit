import {
  contextPath,
  friendlyError,
  inviteBanner,
  linkProblemCopy,
  problemFromReason,
  type InviteKind,
} from '@athleit/core';
import { acceptInvite, previewInvite } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, LoadState } from '@/components/app/kit';
import { LinkBanner, ContinueAs, useInviteBanner } from '@/components/auth/link-banner';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';
import { kv, PENDING_INVITE_KEY, POST_AUTH_INTENT_KEY } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const KIND = { team: 'team', club: 'club', household: 'family' } as const;

function Landing({ token }: { token: string }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { refresh, setActive } = useApp();
  const preview = useLoad(() => previewInvite(supabase, token), [token]);
  const banner = useInviteBanner(token);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = preview.data?.[0];

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptInvite(supabase, token);
    setBusy(false);
    const joined = res.data?.[0];
    if (res.error || !joined) return setError(friendlyError(res.error));
    await refresh();
    const id = (joined.team_id ?? joined.club_id ?? joined.household_id) as string;
    const kind = joined.team_id ? 'team' : joined.club_id ? 'club' : 'family';
    setActive(kind === 'family' ? `family:${id}` : `${kind}:${id}`);
    router.replace(contextPath({ kind, id } as never) as never);
  }

  async function switchAccount() {
    // Keep the invite so the next account lands back here.
    await kv.set(PENDING_INVITE_KEY, token);
    await signOut();
  }

  const user = session?.user;
  const name = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const email = user?.email ?? '';
  const problem = linkProblemCopy(problemFromReason(p?.reason));
  const fallback =
    p?.valid && p.kind
      ? inviteBanner({
          kind: (KIND[p.kind as keyof typeof KIND] ?? 'team') as InviteKind,
          targetName: p.target_name ?? '',
          role: p.role ?? '',
        })
      : null;
  const shown = banner.banner ?? fallback;

  return (
    <AppScreen>
      <LoadState loading={preview.loading} error={preview.error} onRetry={preview.reload}>
        <Card style={{ gap: space[3] }} testID="invite-landing">
          {p?.valid && shown ? (
            <>
              <LinkBanner {...shown} />
              <FormMessage error={error} />
              <ContinueAs
                name={name}
                email={email}
                actionTitle="Accept invite"
                busy={busy}
                onContinue={() => void accept()}
                onSwitch={() => void switchAccount()}
              />
            </>
          ) : (
            <>
              <H1>{problem.title}</H1>
              <Text accessibilityRole="alert">{problem.body}</Text>
              <Button
                title="Go to Athleit"
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </>
          )}
        </Card>
      </LoadState>
    </AppScreen>
  );
}

/** Signed out: who invited you comes first, then the way in. The token survives sign-up and OAuth. */
function SignedOutInvite({ token }: { token: string }) {
  const router = useRouter();
  const { loading, error, reload, outcome, banner } = useInviteBanner(token);

  async function go(path: '/sign-in' | '/sign-up') {
    await kv.set(PENDING_INVITE_KEY, token);
    router.replace(path);
  }

  return (
    <Screen contentStyle={{ justifyContent: 'center' }}>
      <LoadState loading={loading} error={error} onRetry={reload}>
        {banner ? (
          <View style={{ gap: space[4] }}>
            <LinkBanner {...banner} />
            <Button
              title="Create account and continue"
              size="lg"
              onPress={() => void go('/sign-up')}
            />
            <Button
              title="I already have an account"
              variant="secondary"
              size="lg"
              onPress={() => void go('/sign-in')}
            />
          </View>
        ) : (
          <View style={{ gap: space[4] }}>
            <H1>{linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome).title}</H1>
            <Text accessibilityRole="alert">
              {linkProblemCopy(outcome === 'ok' ? 'invalid' : outcome).body}
            </Text>
            <Button title="Sign in" size="lg" onPress={() => router.replace('/sign-in')} />
            <Button
              title="I have a code"
              variant="secondary"
              size="lg"
              onPress={() => {
                void kv.set(POST_AUTH_INTENT_KEY, 'code');
                router.replace('/sign-up');
              }}
            />
          </View>
        )}
      </LoadState>
    </Screen>
  );
}

/** Opened from a shared link or QR code (athleit://invite/… or the universal link). */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  return session ? <Landing token={token} /> : <SignedOutInvite token={token} />;
}

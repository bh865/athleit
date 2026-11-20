import {
  claimBanner,
  continueAsCopy,
  inviteBanner,
  type InviteKind,
  type PublicPreviewOutcome,
} from '@athleit/core';
import { previewClaimPublic, previewInvitePublic } from '@athleit/db/api';
import { radius, space } from '@athleit/tokens';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Icon, Text, useTheme } from '@/components/ui';
import { kv, PENDING_INVITE_KEY } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** Who invited you and what you are joining, shown before any form. */
export function LinkBanner({ title, body }: { title: string; body: string }) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={{
        flexDirection: 'row',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.lg,
        backgroundColor: c.surfaceAlt,
        alignItems: 'flex-start',
      }}
    >
      <Icon name="envelope-simple" color={c.ink} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="bodyBold" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="caption" muted>
          {body}
        </Text>
      </View>
    </View>
  );
}

/** The signed-out preview of an invite token, as the banner's words (or the reason it can't be used). */
export function useInviteBanner(token: string | undefined) {
  const preview = useLoad(() => previewInvitePublic(supabase, token ?? ''), [token]);
  const row = preview.data?.[0];
  const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
  const banner =
    row && outcome === 'ok'
      ? inviteBanner({
          kind: row.kind as InviteKind,
          targetName: row.target_name ?? '',
          role: row.role ?? '',
          inviterFirstName: row.inviter_first_name,
        })
      : null;
  return {
    loading: preview.loading,
    error: preview.error,
    reload: preview.reload,
    outcome,
    banner,
  };
}

export function useClaimBanner(playerId: string | undefined) {
  const preview = useLoad(() => previewClaimPublic(supabase, playerId ?? ''), [playerId]);
  const row = preview.data?.[0];
  const outcome = (row?.outcome ?? 'invalid') as PublicPreviewOutcome;
  return {
    loading: preview.loading,
    error: preview.error,
    reload: preview.reload,
    outcome,
    banner: outcome === 'ok' ? claimBanner(row?.player_first_name) : null,
  };
}

/** Above the sign-in and create-account forms when the person arrived from an invite or claim link. */
export function PendingLinkBanner() {
  const [pending, setPending] = useState<{ kind: 'invite' | 'claim'; id: string } | null>(null);
  useEffect(() => {
    kv.get(PENDING_INVITE_KEY).then((v) => {
      if (!v) return;
      setPending(
        v.startsWith('__claim__') ? { kind: 'claim', id: v.slice(9) } : { kind: 'invite', id: v },
      );
    });
  }, []);
  if (!pending) return null;
  return pending.kind === 'invite' ? (
    <InviteBannerFor token={pending.id} />
  ) : (
    <ClaimBannerFor playerId={pending.id} />
  );
}

function InviteBannerFor({ token }: { token: string }) {
  const { banner } = useInviteBanner(token);
  return banner ? <LinkBanner {...banner} /> : null;
}

function ClaimBannerFor({ playerId }: { playerId: string }) {
  const { banner } = useClaimBanner(playerId);
  return banner ? <LinkBanner {...banner} /> : null;
}

/**
 * Signed in on a link: show which account is about to act, with a way out. Never accepts silently.
 */
export function ContinueAs({
  name,
  email,
  actionTitle,
  busy,
  onContinue,
  onSwitch,
}: {
  name: string;
  email: string;
  actionTitle: string;
  busy?: boolean;
  onContinue: () => void;
  onSwitch: () => void;
}) {
  const { theme } = useTheme();
  const copy = continueAsCopy(email);
  const first = name.split(' ')[0] || name;
  return (
    <View style={{ gap: space[3] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          padding: space[3],
          borderRadius: radius.lg,
          backgroundColor: theme.color.surfaceAlt,
        }}
      >
        <Avatar name={name || email} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{`Continue as ${first}`}</Text>
          <Text variant="caption" muted>
            {email}
          </Text>
        </View>
      </View>
      <Button title={actionTitle} size="lg" loading={Boolean(busy)} onPress={onContinue} />
      <Button
        title="Not you? Sign out"
        variant="ghost"
        accessibilityHint={copy.body}
        onPress={onSwitch}
      />
    </View>
  );
}

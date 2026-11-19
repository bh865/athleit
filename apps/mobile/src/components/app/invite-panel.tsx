import { friendlyError } from '@athleit/core';
import {
  createHouseholdInvite,
  createInvite,
  listInvites,
  revokeInvite,
  type InviteTarget,
} from '@athleit/db/api';
import { componentTokens, space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Text, TextField, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { FamilyCodePanel } from './family-code-panel';
import { Badge, Choice, FormMessage, H2, ListItem, LoadState, Notice, Segmented } from './kit';

export interface RoleOption {
  value: string;
  label: string;
}

/** Public web origin used in shared links (also the universal-link host once configured). */
export const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://athleit.app';

function status(inv: {
  revoked_at: string | null;
  expires_at: string;
  use_count: number;
  max_uses: number;
}) {
  if (inv.revoked_at) return { label: 'Revoked', tone: 'danger' as const };
  if (new Date(inv.expires_at) <= new Date()) return { label: 'Expired', tone: 'warning' as const };
  if (inv.use_count >= inv.max_uses) return { label: 'Used up', tone: 'neutral' as const };
  return { label: 'Active', tone: 'success' as const };
}

/** Create invite links (QR, share sheet, copy), list them, and revoke. */
export function InvitePanel({
  target,
  roles,
  childNames = [],
}: {
  target: InviteTarget;
  roles: readonly RoleOption[];
  /** Household invites only: the children named in the approve confirmation. */
  childNames?: readonly string[];
}) {
  const [tab, setTab] = useState<'link' | 'code'>('link');
  if (!('householdId' in target)) return <LinkInvitePanel target={target} roles={roles} />;
  return (
    <View style={{ gap: space[4] }}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'link', label: 'Link' },
          { value: 'code', label: 'Code' },
        ]}
      />
      {tab === 'link' ? (
        <LinkInvitePanel target={target} roles={roles} />
      ) : (
        <FamilyCodePanel householdId={target.householdId} childNames={childNames} />
      )}
    </View>
  );
}

function LinkInvitePanel({
  target,
  roles,
}: {
  target: InviteTarget;
  roles: readonly RoleOption[];
}) {
  const { theme } = useTheme();
  const list = useLoad(() => listInvites(supabase, target), [JSON.stringify(target)]);
  const [role, setRole] = useState(roles[0]?.value ?? '');
  const [days, setDays] = useState('7');
  const [uses, setUses] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; role: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreate() {
    const expiresInDays = Number(days);
    const maxUses = Number(uses);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90)
      return setError('Choose an expiry between 1 and 90 days.');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
      return setError('Choose between 1 and 1000 uses.');
    setError(null);
    setBusy(true);
    const res =
      'householdId' in target
        ? await createHouseholdInvite(supabase, {
            householdId: target.householdId,
            expiresInDays,
            maxUses,
          })
        : await createInvite(supabase, { target, role, expiresInDays, maxUses });
    setBusy(false);
    const row = res.data?.[0];
    if (res.error || !row) return setError(friendlyError(res.error));
    setCreated({ url: `${WEB_ORIGIN}/invite/${row.token}`, role });
    setCopied(false);
    list.reload();
  }

  async function onRevoke(id: string) {
    const res = await revokeInvite(supabase, id);
    if (res.error) setError(friendlyError(res.error));
    else list.reload();
  }

  return (
    <View style={{ gap: space[4] }}>
      {roles.length > 1 && (
        <Choice
          label="Role"
          value={role}
          options={roles.map((r) => ({ value: r.value, label: r.label }))}
          onChange={setRole}
        />
      )}
      <TextField
        label="Expires in (days)"
        keyboardType="number-pad"
        value={days}
        onChangeText={setDays}
      />
      <TextField
        label="Number of uses"
        keyboardType="number-pad"
        value={uses}
        onChangeText={setUses}
      />
      <FormMessage error={error} />
      <Button title="Create invite link" loading={busy} onPress={() => void onCreate()} />

      {created && (
        <View style={{ gap: space[3] }} testID="new-invite">
          <Notice>Share this link. It’s shown once, and anyone who has it can join.</Notice>
          <Text variant="mono" selectable testID="invite-link">
            {created.url}
          </Text>
          <View
            style={{
              alignSelf: 'flex-start',
              padding: space[2],
              backgroundColor: theme.color.qrSurface,
            }}
          >
            <QRCode
              value={created.url}
              size={componentTokens.qr.size}
              color={theme.color.qrInk}
              backgroundColor={theme.color.qrSurface}
            />
          </View>
          <Button title="Share…" onPress={() => void Share.share({ message: created.url })} />
          <Button
            title={copied ? 'Copied' : 'Copy link'}
            variant="secondary"
            onPress={() => {
              void Clipboard.setStringAsync(created.url).then(() => setCopied(true));
            }}
          />
        </View>
      )}

      <H2>Invites</H2>
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        emptyText="No invites yet."
        onRetry={list.reload}
      >
        <View style={{ gap: space[2] }}>
          {list.data?.map((inv) => {
            const s = status(inv);
            return (
              <View key={inv.id} style={{ gap: space[1] }}>
                <ListItem
                  title={roles.find((r) => r.value === inv.role)?.label ?? inv.role}
                  subtitle={`${inv.use_count}/${inv.max_uses} used · expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                  right={<Badge tone={s.tone}>{s.label}</Badge>}
                />
                {s.label === 'Active' && (
                  <Button title="Revoke" variant="ghost" onPress={() => void onRevoke(inv.id)} />
                )}
              </View>
            );
          })}
        </View>
      </LoadState>
    </View>
  );
}

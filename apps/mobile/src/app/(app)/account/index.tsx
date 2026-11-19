import {
  friendlyError,
  memberSince,
  noDeletionBlockers,
  rolesLabel,
  sortRoles,
  type ContextRole,
  type DeletionBlockers,
} from '@athleit/core';
import { deleteMyAccount, getAccountBlockers } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H2, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import {
  Avatar,
  Button,
  Chip,
  ListGroup,
  ListRow,
  Sheet,
  Text,
  TextField,
  ThemeToggle,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
const LINKS = [
  { label: 'Help center', href: extra.helpUrl },
  {
    label: 'Contact support',
    href: extra.supportEmail ? `mailto:${extra.supportEmail}` : undefined,
  },
  { label: 'Terms of service', href: extra.termsUrl },
  { label: 'Privacy policy', href: extra.privacyUrl },
].filter((l): l is { label: string; href: string } => !!l.href);

export default function AccountScreen() {
  useScreenTitle('Account');
  const router = useRouter();
  const { signOut } = useAuth();
  const { displayName, email, avatarUrl, contexts, memberSince: since } = useApp();
  const name = displayName ?? '';
  const [step, setStep] = useState<'closed' | 'blocked' | 'confirm'>('closed');
  const [blockers, setBlockers] = useState<DeletionBlockers | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chips = [
    ...new Set(
      contexts.map((c) =>
        c.kind === 'family'
          ? 'Parent'
          : `${rolesLabel(sortRoles(c.roles as ContextRole[]))} · ${c.title}`,
      ),
    ),
  ];
  const teams = contexts.filter((c) => c.kind === 'team').length;
  const clubs = contexts.filter((c) => c.kind === 'club').length;

  async function startDelete() {
    setError(null);
    setBusy(true);
    const r = await getAccountBlockers(supabase);
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setBlockers(r.data);
    setStep(noDeletionBlockers(r.data) ? 'confirm' : 'blocked');
  }
  async function remove() {
    setBusy(true);
    const r = await deleteMyAccount(supabase, word);
    if (r.error) {
      setBusy(false);
      if (r.error.code === 'blocked') {
        setBlockers(JSON.parse(r.error.details ?? '{}') as DeletionBlockers);
        return setStep('blocked');
      }
      return setError(friendlyError(r.error));
    }
    await signOut();
  }
  const close = () => {
    setStep('closed');
    setWord('');
    setError(null);
  };

  return (
    <AppScreen>
      <View style={{ gap: space[6] }}>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <Avatar name={name} src={avatarUrl} size="lg" />
          <Text variant="heading">{name}</Text>
          <Text muted>{email}</Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space[2],
              justifyContent: 'center',
            }}
          >
            {chips.map((c) => (
              <Chip key={c} label={c} />
            ))}
            {since ? <Chip label={`Member since ${memberSince(since)}`} /> : null}
          </View>
        </View>

        <ListGroup>
          <ListRow
            title="Profile"
            subtitle="Name, photo, email"
            onPress={() => router.push('/account/profile' as never)}
            testID="row-profile"
          />
          <ListRow
            title="Roles & places"
            subtitle={`${teams} ${teams === 1 ? 'team' : 'teams'} · ${clubs} ${clubs === 1 ? 'club' : 'clubs'}`}
            onPress={() => router.push('/account/places' as never)}
          />
          <ListRow
            title="Notifications"
            subtitle="Push, email, quiet hours, devices"
            onPress={() => router.push('/account/notifications' as never)}
          />
          <ListRow
            title="Security"
            subtitle="Password, sign-in methods"
            onPress={() => router.push('/account/security' as never)}
            last
          />
        </ListGroup>

        <View style={{ gap: space[3] }}>
          <H2>Appearance</H2>
          <ThemeToggle />
        </View>

        {LINKS.length ? (
          <ListGroup>
            {LINKS.map((l, i) => (
              <ListRow
                key={l.label}
                title={l.label}
                last={i === LINKS.length - 1}
                onPress={() => void Linking.openURL(l.href)}
              />
            ))}
          </ListGroup>
        ) : null}
        <Text variant="caption" muted>
          App version · Athleit {Constants.expoConfig?.version ?? 'dev'}
        </Text>

        <View style={{ gap: space[2] }}>
          <Button
            title="Sign out"
            variant="secondary"
            icon="sign-out"
            onPress={() => void signOut()}
            testID="account-sign-out"
          />
          <Button
            title="Delete account"
            variant="ghost"
            icon="trash"
            loading={busy && step === 'closed'}
            onPress={() => void startDelete()}
            testID="delete-account"
          />
          {error && step === 'closed' ? <Notice tone="error">{error}</Notice> : null}
        </View>
      </View>

      <Sheet open={step === 'blocked'} onClose={close} title="Can’t delete yet" level="modal">
        <Text variant="heading">Can’t delete yet</Text>
        {blockers?.teams.map((t) => (
          <Text key={t.id}>You’re the only admin of {t.name}.</Text>
        ))}
        {blockers?.clubs.map((c) => (
          <Text key={c.id}>You’re the only admin of {c.name}.</Text>
        ))}
        {blockers?.households.map((h) => (
          <Text key={h.id}>You’re the only guardian of the children in {h.name}.</Text>
        ))}
        <Text muted>Make someone else an admin or guardian first, then come back.</Text>
        <Button
          title="Manage places"
          onPress={() => {
            close();
            router.push('/account/places' as never);
          }}
        />
        <Button title="Close" variant="ghost" onPress={close} />
      </Sheet>

      <Sheet open={step === 'confirm'} onClose={close} title="Delete your account" level="modal">
        <Text variant="heading">Delete your account</Text>
        <Text variant="caption" muted>
          THIS CAN’T BE UNDONE
        </Text>
        <Text>
          <Text variant="bodyBold">Deleted: </Text>profile, photo, settings, devices, sign-in
          methods, memberships.
        </Text>
        <Text>
          <Text variant="bodyBold">Kept: </Text>payment records clubs must keep, signed waivers,
          messages shown as “Former member”.
        </Text>
        <TextField
          label="Type DELETE to confirm"
          value={word}
          autoCapitalize="characters"
          autoComplete="off"
          onChangeText={setWord}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          title="Permanently delete account"
          loading={busy}
          disabled={word !== 'DELETE'}
          onPress={() => void remove()}
          testID="confirm-delete"
        />
        <Button title="Cancel" variant="ghost" onPress={close} />
      </Sheet>
    </AppScreen>
  );
}

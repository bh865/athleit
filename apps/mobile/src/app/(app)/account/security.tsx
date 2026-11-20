import {
  authErrorMessage,
  canDisconnectMethod,
  changePasswordSchema,
  hasPasswordMethod,
  OAUTH_PROVIDERS,
  passwordStrength,
  type SignInMethod,
} from '@athleit/core';
import { space } from '@athleit/tokens';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, H2 } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import {
  Badge,
  Button,
  ListGroup,
  ListRow,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type UserIdentity = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.getUserIdentities>>['data']
>['identities'][number];

const NAME: Record<string, string> = { email: 'Email', google: 'Google', apple: 'Apple' };

export default function AccountSecurityScreen() {
  useScreenTitle('Security');
  const { email } = useApp();
  const { signOut } = useAuth();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [busy, setBusy] = useState(false);

  const ids = useLoad(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data?.identities ?? []) as UserIdentity[], error: null };
  }, []);
  const identities = ids.loading ? null : (ids.data ?? []);
  const methods: SignInMethod[] = (identities ?? []).map((i) => ({
    provider: i.provider,
    identityId: i.identity_id,
  }));
  const hasPassword = hasPasswordMethod(methods);

  async function disconnect(provider: string) {
    const identity = identities?.find((i) => i.provider === provider);
    if (!identity || !canDisconnectMethod(methods, provider)) return;
    setBusy(true);
    const { error } = await supabase.auth.unlinkIdentity(identity);
    setBusy(false);
    if (error) return toast(authErrorMessage(error), 'danger');
    toast(`${NAME[provider] ?? provider} disconnected`);
    ids.reload();
  }
  async function connect(provider: (typeof OAUTH_PROVIDERS)[number]) {
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return toast(authErrorMessage(error), 'danger');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;
    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code === 'string') {
      const ex = await supabase.auth.exchangeCodeForSession(code);
      if (ex.error) return toast(authErrorMessage(ex.error), 'danger');
    }
    ids.reload();
  }

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        <H1>Security</H1>
        <H2>Password</H2>
        <Text muted>
          {identities === null
            ? ' '
            : hasPassword
              ? 'Use a password you don’t use anywhere else.'
              : 'You sign in with a provider. Set a password to also sign in with email.'}
        </Text>
        <Button
          title={hasPassword ? 'Change password' : 'Set a password'}
          variant="secondary"
          disabled={identities === null}
          onPress={() => setPwOpen(true)}
          testID="change-password"
        />

        <H2>Sign-in methods</H2>
        <Text muted>You need at least one. The last method can’t be removed.</Text>
        <ListGroup>
          {(['email', ...OAUTH_PROVIDERS] as const).map((p, i, all) => {
            const identity = identities?.find((x) => x.provider === p);
            const detail =
              p === 'email'
                ? identity
                  ? (email ?? '')
                  : 'Not set up'
                : ((identity?.identity_data as { email?: string } | undefined)?.email ??
                  'Not connected');
            return (
              <ListRow
                key={p}
                title={NAME[p] ?? p}
                subtitle={detail}
                last={i === all.length - 1}
                testID={`method-${p}`}
                trailing={
                  identity ? (
                    p === 'email' ? (
                      <Badge tone="success">Connected</Badge>
                    ) : (
                      <Button
                        title="Disconnect"
                        variant="ghost"
                        disabled={busy || !canDisconnectMethod(methods, p)}
                        onPress={() => void disconnect(p)}
                      />
                    )
                  ) : p === 'email' ? undefined : (
                    <Button title="Connect" variant="secondary" onPress={() => void connect(p)} />
                  )
                }
              />
            );
          })}
        </ListGroup>

        <H2>Sign out everywhere</H2>
        <Text muted>Ends your session on every device, including this one.</Text>
        <Button
          title="Sign out everywhere"
          variant="secondary"
          onPress={() => setEverywhere(true)}
        />
      </View>

      <Sheet
        open={everywhere}
        onClose={() => setEverywhere(false)}
        title="Sign out everywhere"
        level="modal"
      >
        <Text variant="heading">Sign out everywhere?</Text>
        <Text>
          You’ll be signed out on this phone and every other device, and asked to sign in again.
        </Text>
        <Button
          title="Sign out everywhere"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await supabase.auth.signOut({ scope: 'global' });
            await signOut();
          }}
        />
        <Button title="Cancel" variant="ghost" onPress={() => setEverywhere(false)} />
      </Sheet>

      <PasswordSheet
        open={pwOpen}
        hasPassword={hasPassword}
        email={email ?? ''}
        onClose={() => setPwOpen(false)}
        onDone={() => {
          setPwOpen(false);
          toast(hasPassword ? 'Password updated' : 'Password set');
          ids.reload();
        }}
      />
    </AppScreen>
  );
}

function PasswordSheet({
  open,
  hasPassword,
  email,
  onClose,
  onDone,
}: {
  open: boolean;
  hasPassword: boolean;
  email: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const strength = next ? passwordStrength(next) : null;

  async function submit() {
    const parsed = changePasswordSchema.safeParse({ current, next, confirm, hasPassword });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
      return setErrors(e);
    }
    setBusy(true);
    if (hasPassword) {
      // Re-check the current password: a stolen, still-open session can't silently change it.
      const { error } = await supabase.auth.signInWithPassword({ email, password: current });
      if (error) {
        setBusy(false);
        return setErrors({ current: 'That isn’t your current password.' });
      }
    }
    const { error } = await supabase.auth.updateUser({
      password: next,
      ...(hasPassword ? { current_password: current } : {}),
    });
    setBusy(false);
    if (error) return setErrors({ next: authErrorMessage(error) });
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose} title={hasPassword ? 'Change password' : 'Set a password'}>
      <Text variant="heading">{hasPassword ? 'Change password' : 'Set a password'}</Text>
      {hasPassword ? (
        <TextField
          label="Current password"
          secureTextEntry
          autoComplete="current-password"
          value={current}
          error={errors.current}
          onChangeText={setCurrent}
        />
      ) : null}
      <TextField
        label="New password"
        secureTextEntry
        autoComplete="new-password"
        value={next}
        error={errors.next}
        onChangeText={setNext}
      />
      {strength ? (
        <Text variant="caption" muted accessibilityLiveRegion="polite">
          Strength: {strength.level[0]!.toUpperCase()}
          {strength.level.slice(1)} · {strength.hint}
        </Text>
      ) : null}
      <TextField
        label="Confirm new password"
        secureTextEntry
        autoComplete="new-password"
        value={confirm}
        error={errors.confirm}
        onChangeText={setConfirm}
      />
      <Button
        title={hasPassword ? 'Update password' : 'Set password'}
        loading={busy}
        onPress={() => void submit()}
        testID="update-password"
      />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

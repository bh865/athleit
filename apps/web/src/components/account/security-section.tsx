'use client';

import {
  canDisconnectMethod,
  changePasswordSchema,
  hasPasswordMethod,
  OAUTH_PROVIDERS,
  passwordStrength,
  type SignInMethod,
} from '@athleit/core';
import type { UserIdentity } from '@supabase/supabase-js';
import { useState } from 'react';

import { signOutEverywhere } from '@/app/(auth)/actions';
import { useApp } from '@/components/app/app-provider';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './account.module.css';
import { authError } from './auth-error';

const NAME: Record<string, string> = {
  email: 'Email and password',
  google: 'Google',
  apple: 'Apple',
};

export function SecuritySection() {
  const { email } = useApp();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [busy, setBusy] = useState(false);

  const ids = useLoad(async () => {
    const { data, error } = await getClient().auth.getUserIdentities();
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data?.identities ?? []) as UserIdentity[], error: null };
  }, []);
  const identities = ids.loading ? null : (ids.data ?? []);
  const load = ids.reload;

  const methods: SignInMethod[] = (identities ?? []).map((i) => ({
    provider: i.provider,
    identityId: i.identity_id,
  }));
  const hasPassword = hasPasswordMethod(methods);

  async function disconnect(provider: string) {
    const identity = identities?.find((i) => i.provider === provider);
    if (!identity || !canDisconnectMethod(methods, provider)) return;
    setBusy(true);
    const { error } = await getClient().auth.unlinkIdentity(identity);
    setBusy(false);
    if (error) return toast(authError(error), 'danger');
    toast(`${NAME[provider] ?? provider} disconnected`);
    load();
  }
  async function connect(provider: (typeof OAUTH_PROVIDERS)[number]) {
    const { error } = await getClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/account%23security` },
    });
    if (error) toast(authError(error), 'danger');
  }

  return (
    <section id="security" className={styles.section} aria-labelledby="security-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="security-h">
          Security
        </Text>
      </div>

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Password
        </Text>
        <Text muted as="p">
          {identities === null
            ? ' '
            : hasPassword
              ? 'Use a password you don’t use anywhere else.'
              : 'You sign in with a provider. Set a password to also sign in with email.'}
        </Text>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => setPwOpen(true)}
            disabled={identities === null}
          >
            {hasPassword ? 'Change password' : 'Set a password'}
          </Button>
        </div>
      </Card>

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Sign-in methods
        </Text>
        <Text muted as="p">
          You need at least one. The last method can’t be removed.
        </Text>
        <ul
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
          className={styles.stack}
          aria-label="Sign-in methods"
        >
          {(['email', ...OAUTH_PROVIDERS] as const).map((p) => {
            const identity = identities?.find((i) => i.provider === p);
            const detail =
              p === 'email'
                ? email
                : ((identity?.identity_data as { email?: string } | undefined)?.email ??
                  'Not connected');
            return (
              <li key={p} className={styles.row} data-testid={`method-${p}`}>
                <div className={styles.rowText}>
                  <Text variant="bodyBold">{NAME[p]}</Text>
                  <Text variant="caption" muted className={styles.truncate}>
                    {p === 'email' && !identity ? 'Not set up' : detail}
                  </Text>
                </div>
                {identity ? (
                  p === 'email' ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy || !canDisconnectMethod(methods, p)}
                      onClick={() => void disconnect(p)}
                      aria-label={`Disconnect ${NAME[p]}`}
                    >
                      Disconnect
                    </Button>
                  )
                ) : p === 'email' ? null : (
                  <Button
                    variant="secondary"
                    onClick={() => void connect(p)}
                    aria-label={`Connect ${NAME[p]}`}
                  >
                    Connect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Sign out everywhere
        </Text>
        <Text muted as="p">
          Ends your session on every device, including this one.
        </Text>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setEverywhere(true)}>
            Sign out everywhere
          </Button>
        </div>
      </Card>

      <ConfirmSheet
        open={everywhere}
        onClose={() => setEverywhere(false)}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void signOutEverywhere();
        }}
      >
        <Text as="p">
          You’ll be signed out on this device and every other one, and asked to sign in again.
        </Text>
      </ConfirmSheet>

      <PasswordSheet
        open={pwOpen}
        hasPassword={hasPassword}
        email={email ?? ''}
        onClose={() => setPwOpen(false)}
        onDone={() => {
          setPwOpen(false);
          toast(hasPassword ? 'Password updated' : 'Password set');
          load();
        }}
      />
    </section>
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
    const client = getClient();
    if (hasPassword) {
      // Re-check the current password: a stolen, still-open session can't silently change it.
      const { error } = await client.auth.signInWithPassword({ email, password: current });
      if (error) {
        setBusy(false);
        return setErrors({ current: 'That isn’t your current password.' });
      }
    }
    const { error } = await client.auth.updateUser({
      password: next,
      ...(hasPassword ? { current_password: current } : {}),
    });
    setBusy(false);
    if (error) return setErrors({ next: authError(error) });
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    onDone();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={hasPassword ? 'Change password' : 'Set a password'}
      placement="right"
    >
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Text variant="heading" as="h2">
          {hasPassword ? 'Change password' : 'Set a password'}
        </Text>
        {hasPassword ? (
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            error={errors.current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        ) : null}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          error={errors.next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Text variant="caption" muted as="p" className={styles.strength} aria-live="polite">
          {strength
            ? `Strength: ${strength.level[0]!.toUpperCase()}${strength.level.slice(1)} · ${strength.hint}`
            : ' '}
        </Text>
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className={styles.actions}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

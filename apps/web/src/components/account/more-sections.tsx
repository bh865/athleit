'use client';

import { friendlyError, noDeletionBlockers, type DeletionBlockers } from '@athleit/core';
import { deleteMyAccount, getAccountBlockers } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { signOut } from '@/app/(auth)/actions';
import {
  Button,
  ButtonLink,
  Card,
  ConfirmSheet,
  Icon,
  Sheet,
  Text,
  TextField,
  ThemeToggle,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './account.module.css';

const LINKS = [
  { label: 'Help center', href: '/help' },
  { label: 'Contact support', href: '/help/contact' },
  { label: 'Your requests', href: '/help/requests' },
  { label: 'Terms of service', href: process.env.NEXT_PUBLIC_TERMS_URL },
  { label: 'Privacy policy', href: process.env.NEXT_PUBLIC_PRIVACY_URL },
].filter((l): l is { label: string; href: string } => !!l.href);

export function AppearanceSection() {
  return (
    <section id="appearance" className={styles.section} aria-labelledby="appearance-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="appearance-h">
          Appearance
        </Text>
        <Text muted as="p">
          Choose how Athleit looks on this device.
        </Text>
      </div>
      <Card className={styles.card}>
        <ThemeToggle />
      </Card>
    </section>
  );
}

export function HelpSection() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
  return (
    <section id="help" className={styles.section} aria-labelledby="help-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="help-h">
          Help &amp; legal
        </Text>
      </div>
      <Card className={styles.card}>
        {LINKS.length ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} className={styles.stack}>
            {LINKS.map((l) => (
              <li key={l.label}>
                <ButtonLink
                  href={l.href}
                  variant="ghost"
                  target={l.href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  {l.label} <Icon name="arrow-right" size="sm" />
                </ButtonLink>
              </li>
            ))}
          </ul>
        ) : null}
        <Text variant="caption" muted>
          App version · Athleit {version}
        </Text>
      </Card>
    </section>
  );
}

export function AccountActions() {
  const router = useRouter();
  const [step, setStep] = useState<'closed' | 'checking' | 'blocked' | 'confirm'>('closed');
  const [blockers, setBlockers] = useState<DeletionBlockers | null>(null);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStep('checking');
    setError(null);
    const r = await getAccountBlockers(getClient());
    if (r.error) {
      setStep('closed');
      return setError(friendlyError(r.error));
    }
    setBlockers(r.data);
    setStep(noDeletionBlockers(r.data) ? 'confirm' : 'blocked');
  }
  async function remove() {
    setBusy(true);
    const r = await deleteMyAccount(getClient(), word);
    if (r.error) {
      setBusy(false);
      if (r.error.code === 'blocked') {
        setBlockers(JSON.parse(r.error.details ?? '{}') as DeletionBlockers);
        return setStep('blocked');
      }
      return setError(friendlyError(r.error));
    }
    await getClient().auth.signOut({ scope: 'local' });
    router.replace('/sign-in');
  }
  const close = () => {
    setStep('closed');
    setWord('');
    setError(null);
  };

  return (
    <section id="actions" className={styles.section} aria-labelledby="actions-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="actions-h">
          Account actions
        </Text>
      </div>
      <Card className={styles.card}>
        <div className={styles.actions} style={{ justifyContent: 'flex-start' }}>
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              <Icon name="sign-out" size="sm" /> Sign out
            </Button>
          </form>
          <Button
            variant="ghost"
            className={styles.danger}
            onClick={() => void start()}
            loading={step === 'checking'}
          >
            <Icon name="trash" size="sm" /> Delete account
          </Button>
        </div>
        {error ? (
          <Text role="alert" className={styles.danger} as="p">
            {error}
          </Text>
        ) : null}
      </Card>

      <Sheet open={step === 'blocked'} onClose={close} title="Can’t delete yet" level="modal">
        <div className={styles.stack}>
          <Text variant="heading" as="h2">
            You can’t delete your account yet
          </Text>
          <Text as="p">Transfer these first:</Text>
          <ul className={styles.list}>
            {blockers?.teams.map((t) => (
              <li key={t.id}>{t.name} · only admin</li>
            ))}
            {blockers?.clubs.map((c) => (
              <li key={c.id}>{c.name} · only admin</li>
            ))}
            {blockers?.plans.map((p) => (
              <li key={p.id}>{p.name} · payment plan with installments still to pay</li>
            ))}
            {blockers?.households.map((h) => (
              <li key={h.id}>{h.name} · only guardian of children</li>
            ))}
          </ul>
          <Text muted as="p">
            Make someone else an admin or guardian, or remove the team, club or children, then come
            back.
          </Text>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <ButtonLink href="/account#roles" onClick={close}>
              Manage places
            </ButtonLink>
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={step === 'confirm'}
        onClose={close}
        title="Delete your account"
        confirmLabel="Permanently delete account"
        busy={busy}
        confirmDisabled={word !== 'DELETE'}
        onConfirm={() => void remove()}
      >
        <Text variant="caption" muted as="p">
          THIS CAN’T BE UNDONE
        </Text>
        <div>
          <Text variant="bodyBold">Deleted</Text>
          <ul className={styles.list}>
            <li>Your profile and photo</li>
            <li>Notification settings and devices</li>
            <li>Sign-in methods</li>
            <li>Memberships</li>
          </ul>
        </div>
        <div>
          <Text variant="bodyBold">Kept</Text>
          <ul className={styles.list}>
            <li>Payment records clubs must keep</li>
            <li>Signed waivers</li>
            <li>Messages you sent, shown as “Former member”</li>
          </ul>
        </div>
        <TextField
          label="Type DELETE to confirm"
          value={word}
          autoComplete="off"
          onChange={(e) => setWord(e.target.value)}
          error={error ?? undefined}
        />
      </ConfirmSheet>
    </section>
  );
}

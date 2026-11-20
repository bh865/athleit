'use client';

import type { Client } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { signOut } from '@/app/(auth)/actions';
import { Button, Sheet, Text, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './mfa.module.css';

const WRONG = 'That code didn’t work. Try the next one.';
const QR_SIZE = 192;
const QR_MARGIN = 1;
const clean = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/** Enrol an authenticator app (TOTP). Shown to a platform admin with no verified factor; nothing else in the portal is reachable. */
export function MfaSetup({ role, stripeMode }: { role: string; stripeMode: 'test' | 'live' }) {
  const router = useRouter();
  const [enrol, setEnrol] = useState<{ id: string; secret: string; uri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const supabase = getClient();
    void (async () => {
      // A half-finished earlier attempt leaves an unverified factor behind; clear it so enrolling again works.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? [])
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Athleit admin ${Date.now()}`,
      });
      if (e || !data) return setError('We couldn’t start setup. Refresh the page to try again.');
      setEnrol({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
      setQr(await QRCode.toDataURL(data.totp.uri, { margin: QR_MARGIN, width: QR_SIZE }));
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!enrol || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getClient().auth.mfa.challengeAndVerify({
      factorId: enrol.id,
      code,
    });
    setBusy(false);
    if (err) return setError(WRONG);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit} aria-labelledby="mfa-setup-title">
        <div className={styles.chips}>
          <span className={styles.chip}>{stripeMode === 'live' ? 'Live' : 'Test mode'}</span>
          <span className={styles.chip}>{role[0]!.toUpperCase() + role.slice(1)}</span>
        </div>
        <Text variant="heading" as="h1" id="mfa-setup-title">
          Set up two-step verification
        </Text>
        <Text variant="body">
          Athleit admin needs a second step before you can change anything. You can read without it.
        </Text>
        <ol className={styles.steps}>
          <li>
            <strong>Scan the code</strong>
            <span>Open an authenticator app and scan.</span>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing
              <img
                src={qr}
                alt="QR code for your authenticator app"
                width={QR_SIZE}
                height={QR_SIZE}
                className={styles.qr}
              />
            ) : (
              <div className={styles.qrWait} aria-hidden />
            )}
            <details>
              <summary>Can’t scan? Enter this key</summary>
              <code className={styles.secret}>
                {enrol ? enrol.secret.replace(/(.{4})/g, '$1 ').trim() : '…'}
              </code>
              <Button
                type="button"
                variant="ghost"
                onClick={() => enrol && void navigator.clipboard?.writeText(enrol.secret)}
              >
                Copy key
              </Button>
            </details>
          </li>
          <li>
            <strong>Enter the 6-digit code</strong>
            <span>The code changes every 30 seconds.</span>
            <TextField
              label="6-digit code"
              mono
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              error={error ?? undefined}
              onChange={(e) => setCode(clean(e.target.value))}
            />
          </li>
        </ol>
        <Text variant="caption">
          Keep access recoverable. If you lose your authenticator, another owner has to reset it.
          Save the key in your team password manager.
        </Text>
        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!enrol || code.length !== 6}>
            Turn on
          </Button>
        </div>
      </form>
      <form action={signOut} className={styles.signOut}>
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </main>
  );
}

/** Verify to make changes: the code box used by the step-up sheet and the verify page. */
export function VerifyForm({
  factorId,
  minutes,
  client = getClient,
  onVerified,
  secondary,
  submitLabel = 'Verify',
}: {
  factorId: string;
  minutes: number;
  client?: () => Client;
  onVerified: () => void;
  secondary?: React.ReactNode;
  submitLabel?: string;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await client().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (err) {
      setCode('');
      return setError(WRONG);
    }
    onVerified();
  }
  return (
    <form onSubmit={submit} className={styles.verify}>
      <TextField
        label="6-digit code"
        mono
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        error={error ?? undefined}
        onChange={(e) => setCode(clean(e.target.value))}
        hint={`Codes refresh every 30 seconds. After verifying you can edit for ${minutes} minutes.`}
      />
      <div className={styles.actions}>
        {secondary}
        <Button type="submit" loading={busy} disabled={code.length !== 6}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** The step-up sheet: opened by a write at aal1 (the pending change is kept by the provider and applied after verifying). */
export function StepUpSheet({
  open,
  factorId,
  minutes,
  client,
  onCancel,
  onVerified,
}: {
  open: boolean;
  factorId: string;
  minutes: number;
  client: () => Client;
  onCancel: () => void;
  onVerified: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title="Verify to make this change" level="modal">
      <div className={styles.sheet}>
        <Text variant="heading" as="h2">
          Verify to make this change
        </Text>
        <Text variant="body">Your change is kept here and applied right after you verify.</Text>
        <VerifyForm
          factorId={factorId}
          minutes={minutes}
          client={client}
          onVerified={onVerified}
          submitLabel="Verify and continue"
          secondary={
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          }
        />
      </div>
    </Sheet>
  );
}

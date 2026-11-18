'use client';

import { friendlyError, registrationErrorMessage } from '@athleit/core';
import { callRegistrationFn } from '@athleit/db/registration';
import { useState } from 'react';

import { Button, Select, Text, TextField } from '@/components/ui';
import { currentAccessToken, edgeConfig, RELATIONSHIPS } from '@/lib/registration';

import styles from './registration.module.css';

export interface WaiverToSign {
  versionId: string;
  title: string;
  body: string;
  signed: boolean;
}

/**
 * Typed-signature flow for one registration. Signing goes through the sign-waiver Edge Function, which records the
 * acceptance, builds the signed PDF copy and emails it. A visitor uses the single-use `signToken`; a signed-in
 * parent uses their session.
 */
export function WaiverSigner({
  waivers,
  registrationId,
  signToken,
  defaults,
  onChanged,
}: {
  waivers: WaiverToSign[];
  registrationId?: string;
  signToken?: string;
  defaults?: { name?: string; email?: string; relationship?: string };
  onChanged: () => void;
}) {
  const open = waivers.filter((w) => !w.signed);
  const [name, setName] = useState(defaults?.name ?? '');
  const [email, setEmail] = useState(defaults?.email ?? '');
  const [rel, setRel] = useState(defaults?.relationship ?? 'parent');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<'emailed' | string | null>(null);
  const current = open[0];

  if (!current)
    return (
      <Text as="p" role="status">
        All waivers are signed. Thank you.
      </Text>
    );

  async function sign() {
    if (!current) return;
    setBusy(true);
    setError(null);
    const token = signToken ? null : await currentAccessToken();
    const r = await callRegistrationFn<{ error?: string; copy?: string }>(
      edgeConfig,
      'sign-waiver',
      {
        waiverVersionId: current.versionId,
        ...(signToken ? { signToken } : { registrationId }),
        signerName: name,
        signerEmail: email,
        signerRelationship: rel,
        electronicConsent: consent,
      },
      token,
    );
    setBusy(false);
    if (!r.ok && r.body.error !== 'already_signed') {
      setError(r.body.error ? registrationErrorMessage(r.body.error) : friendlyError(null));
      return;
    }
    setLast(r.body.copy ?? null);
    setConsent(false);
    onChanged();
  }

  return (
    <div className={styles.stack}>
      <Text variant="label">
        Waiver {waivers.length - open.length + 1} of {waivers.length}: {current.title}
      </Text>
      <div
        className={styles.preBody}
        tabIndex={0}
        role="region"
        aria-label={`${current.title} text`}
      >
        {current.body}
      </div>
      <TextField
        label="Type your full legal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />
      <TextField
        label="Email for your signed copy"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Select
        label="You are the child’s"
        value={rel}
        onChange={(e) => setRel(e.target.value)}
        options={RELATIONSHIPS}
      />
      <label className={styles.choice}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I
        agree to sign electronically and that my typed name is my signature.
      </label>
      {error ? (
        <Text role="alert" className={styles.err}>
          {error}
        </Text>
      ) : null}
      {last === 'emailed' ? <Text muted>A signed copy was emailed to you.</Text> : null}
      <Button
        onClick={() => void sign()}
        disabled={busy || !name.trim() || !email.trim() || !consent}
      >
        {busy ? 'Signing…' : 'Sign waiver'}
      </Button>
    </div>
  );
}

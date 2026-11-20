'use client';

import { readCodeInput, UNDER_13_COPY } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from '@/components/onboarding/onboarding.module.css';
import { Button, Card, PageHeader, TextField } from '@/components/ui';

/**
 * Player path (13 and older). A player links their own login from the link a parent or coach sends;
 * the claim page then says whether they are linked or waiting for a parent.
 */
export default function PlayerPathPage() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  function go() {
    const input = readCodeInput(value);
    if (input.kind === 'claim') return router.push(`/claim/${input.playerId}`);
    if (input.kind === 'invite') return router.push(`/invite/${input.token}`);
    setError('Paste the link your parent or coach sent you.');
  }

  return (
    <>
      <PageHeader
        title="Players 13 and older sign in themselves"
        subtitle="Your parent or coach sends you a link. Open it, or paste it here."
      />
      <Card className={styles.stack}>
        <TextField
          label="Link"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          autoCapitalize="none"
          autoComplete="off"
          error={error}
        />
        <p className={styles.muted}>
          Players under 13 don’t have their own login. A parent manages their account.
        </p>
        <Button size="lg" onClick={go}>
          Continue
        </Button>
        <p className={styles.muted}>{UNDER_13_COPY}</p>
      </Card>
    </>
  );
}

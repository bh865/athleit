'use client';

import { registrationErrorMessage } from '@athleit/core';
import { callRegistrationFn } from '@athleit/db/registration';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/registration/registration.module.css';
import { WaiverSigner, type WaiverToSign } from '@/components/registration/waiver-signer';
import { Button, Card, Heading, LoadingSkeleton, Logo, Text } from '@/components/ui';
import { edgeConfig } from '@/lib/registration';

interface Verified {
  displayId: string;
  status: string;
  signToken: string;
  waivers: { versionId: string; title: string; signed: boolean }[];
}

/**
 * Landing page for the emailed link. The token travels in the URL fragment (`#token=…`), which the browser never
 * sends to a server or logs, and is removed from the address bar as soon as it has been read.
 */
export default function VerifyRegistrationPage() {
  const [state, setState] = useState<'working' | 'error' | 'done'>('working');
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState<Verified | null>(null);
  const [waivers, setWaivers] = useState<WaiverToSign[]>([]);

  async function loadWaivers(v: Verified) {
    const r = await callRegistrationFn<{
      waivers?: { versionId: string; title: string; body: string; signed: boolean }[];
    }>(edgeConfig, 'sign-waiver', { signToken: v.signToken, action: 'state' });
    setWaivers(r.ok ? (r.body.waivers ?? []) : []);
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    history.replaceState(null, '', window.location.pathname);
    void (async () => {
      if (!token) {
        setState('error');
        setMessage(registrationErrorMessage('invalid_token'));
        return;
      }
      const r = await callRegistrationFn<Verified & { error?: string }>(
        edgeConfig,
        'verify-registration',
        { token },
      );
      if (!r.ok) {
        setState('error');
        setMessage(registrationErrorMessage(r.body.error));
        return;
      }
      setVerified(r.body);
      setState('done');
      await loadWaivers(r.body);
    })();
  }, []);

  return (
    <main className={styles.page}>
      <Logo variant="lockup" size="md" />
      <Card>
        <div className={styles.stack} aria-live="polite">
          {state === 'working' && <LoadingSkeleton />}
          {state === 'error' && (
            <>
              <Heading as="h1">We couldn’t confirm that link</Heading>
              <Text as="p" role="alert">
                {message}
              </Text>
              <Text muted>
                If your registration is still open, register again and we’ll send a new link.
              </Text>
            </>
          )}
          {state === 'done' && verified && (
            <>
              <Heading as="h1">Email confirmed</Heading>
              <Text as="p">Your registration is in. Keep this reference for your records:</Text>
              <Text variant="mono">{verified.displayId}</Text>
              {waivers.some((w) => !w.signed) ? (
                <>
                  <Heading as="h2">Sign the waivers</Heading>
                  <WaiverSigner
                    waivers={waivers}
                    signToken={verified.signToken}
                    onChanged={() => void loadWaivers(verified)}
                  />
                </>
              ) : (
                <Text muted>
                  Nothing else to do right now. We’ll email you when the organizer decides.
                </Text>
              )}
              <Link href="/sign-up">
                <Button variant="secondary">Create an account to track this</Button>
              </Link>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}

'use client';

import { registrationErrorMessage } from '@athleit/core';
import { callRegistrationFn } from '@athleit/db/registration';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from '@/components/registration/registration.module.css';
import { Card, Heading, LoadingSkeleton, Logo, Text } from '@/components/ui';
import { currentAccessToken, edgeConfig } from '@/lib/registration';

const KEY = 'athleit.claim';

/** Attaches an emailed registration to the signed-in account. The token only works once and only for its recipient. */
export default function ClaimRegistrationPage() {
  const [state, setState] = useState<'working' | 'signin' | 'error' | 'done'>('working');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    try {
      if (token) sessionStorage.setItem(KEY, token);
      else token = sessionStorage.getItem(KEY);
    } catch {
      /* storage unavailable: fall back to the fragment alone */
    }
    history.replaceState(null, '', window.location.pathname);
    void (async () => {
      if (!token) {
        setState('error');
        return setMessage(registrationErrorMessage('invalid_token'));
      }
      const access = await currentAccessToken();
      if (!access) return setState('signin');
      const r = await callRegistrationFn<{ error?: string }>(
        edgeConfig,
        'claim-registration',
        { token },
        access,
      );
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      if (r.ok) setState('done');
      else {
        setState('error');
        setMessage(registrationErrorMessage(r.body.error));
      }
    })();
  }, []);
  return (
    <main className={styles.page}>
      <Logo variant="lockup" size="md" />
      <Card>
        <div className={styles.stack} aria-live="polite">
          {state === 'working' && <LoadingSkeleton />}
          {state === 'signin' && (
            <>
              <Heading as="h1">Sign in to continue</Heading>
              <Text as="p">
                Sign in or create an account, then come back to this link to attach the
                registration.
              </Text>
              <Link href="/sign-in?next=%2Fregister%2Fclaim">Sign in</Link>
              <Link href="/sign-up?next=%2Fregister%2Fclaim">Create an account</Link>
            </>
          )}
          {state === 'error' && (
            <>
              <Heading as="h1">We couldn’t attach that registration</Heading>
              <Text as="p" role="alert">
                {message}
              </Text>
            </>
          )}
          {state === 'done' && (
            <>
              <Heading as="h1">Registration added</Heading>
              <Text as="p">It now appears in your account.</Text>
              <Link href="/registrations">View my registrations</Link>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}

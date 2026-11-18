'use client';

import { useState } from 'react';

import { Captcha } from '@/components/registration/turnstile';
import styles from '@/components/registration/registration.module.css';
import { Card, Heading, Logo, Text } from '@/components/ui';

/**
 * Human check for the mobile app. The app opens this page in an in-app browser; when Turnstile passes, the token is
 * handed back through the app's own URL scheme (athleit://captcha). The target is fixed in code, never taken from
 * the query string, so the token cannot be redirected to another site.
 */
export default function CaptchaHandoffPage() {
  const [done, setDone] = useState(false);
  return (
    <main className={styles.page}>
      <Logo variant="lockup" size="md" />
      <Card>
        <div className={styles.stack}>
          <Heading as="h1">Quick check</Heading>
          <Text as="p" muted>
            Confirm you’re a person to continue in the app.
          </Text>
          <Captcha
            resetKey={0}
            onToken={(t) => {
              if (!t || done) return;
              setDone(true);
              window.location.href = `athleit://captcha?token=${encodeURIComponent(t)}`;
            }}
          />
          {done ? <Text role="status">Returning to the app…</Text> : null}
        </div>
      </Card>
    </main>
  );
}

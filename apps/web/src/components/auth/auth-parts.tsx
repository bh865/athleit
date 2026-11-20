'use client';

import { consentLine, passwordStrengthLabel, resendLabel, resendRemaining } from '@athleit/core';
import { useEffect, useState } from 'react';

import { TextField } from '@/components/ui';
import { legalUrls } from '@/lib/auth-config';

import styles from './auth-parts.module.css';

/**
 * Password field: Show/Hide toggle, caps lock hint and, for a new password, a strength meter in words.
 * The toggle's name is its text ("Show password") rather than an aria-label, so the field is still
 * found by the label "Password".
 */
export function PasswordField({
  name = 'password',
  label = 'Password',
  isNew,
  error,
  autoComplete,
}: {
  name?: string;
  label?: string;
  isNew?: boolean;
  error?: string | undefined;
  autoComplete?: string;
}) {
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const strength = passwordStrengthLabel(value);
  return (
    <div className={styles.passwordWrap}>
      <TextField
        name={name}
        label={label}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete ?? (isNew ? 'new-password' : 'current-password')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
        onBlur={() => setCaps(false)}
        {...(isNew ? { hint: 'At least 8 characters' } : {})}
        error={error}
        trailing={
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? 'Hide' : 'Show'}
            <span className={styles.srOnly}> password</span>
          </button>
        }
      />
      {caps ? (
        <p className={styles.caps} role="status">
          Caps lock is on
        </p>
      ) : null}
      {isNew && strength.level ? (
        <div className={styles.meter} data-level={strength.level}>
          <div className={styles.bars} aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= strength.filled ? styles.barOn : styles.bar} />
            ))}
          </div>
          <p className={styles.meterText} role="status">
            {strength.text}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Terms and Privacy are links only when their URLs are configured. */
export function ConsentLine() {
  return (
    <p className={styles.consent}>
      {consentLine(legalUrls).map((s, i) =>
        s.href ? (
          <a key={i} href={s.href} target="_blank" rel="noreferrer">
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

/** Resend with a cooldown. `startedAt` is when the last email went out (ms). */
export function ResendButton({
  onResend,
  label,
}: {
  onResend: () => Promise<{ error?: string }>;
  label?: string;
}) {
  const [sentAt, setSentAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = resendRemaining(sentAt, now);
  return (
    <div className={styles.resend}>
      <button
        type="button"
        className={styles.resendButton}
        disabled={remaining > 0 || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await onResend();
          setBusy(false);
          if (res.error) return setError(res.error);
          setSentAt(Date.now());
          setNow(Date.now());
        }}
      >
        {remaining > 0 ? resendLabel(remaining) : (label ?? resendLabel(0))}
      </button>
      {error ? (
        <p role="alert" className={styles.resendError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

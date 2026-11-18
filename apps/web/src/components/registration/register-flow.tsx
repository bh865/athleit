'use client';

import {
  formSchemaSchema,
  registrationErrorMessage,
  registrationPriceLabel,
  validateAnswers,
  type FormSchema,
} from '@athleit/core';
import { listChildren } from '@athleit/db/api';
import { callRegistrationFn, type PublicRegistration } from '@athleit/db/registration';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button, Card, Heading, Select, Text, TextField } from '@/components/ui';
import { currentAccessToken, edgeConfig, RELATIONSHIPS } from '@/lib/registration';
import { getClient } from '@/lib/supabase/browser';

import { FormRenderer, type Answers } from './form-renderer';
import styles from './registration.module.css';
import { Captcha } from './turnstile';
import { WaiverSigner, type WaiverToSign } from './waiver-signer';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
}
interface Outcome {
  displayId: string;
  registrationId?: string;
  status: string;
  next: string[];
  waiverVersionIds?: string[];
}
const STEPS = ['Child', 'Details', 'Review'] as const;

/**
 * Registrant flow: child and guardian, the published form, review with the guardian attestation and a captcha.
 * Waivers and payment follow on the confirmation screen. Answers are validated here for friendly errors; the
 * Edge Function validates again and is authoritative. No amount is ever sent: the server prices the registration.
 */
export function RegisterFlow({ event }: { event: PublicRegistration }) {
  const schema = useMemo<FormSchema | null>(() => {
    const p = formSchemaSchema.safeParse(event.form.schema);
    return p.success ? p.data : null;
  }, [event.form.schema]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [step, setStep] = useState(0);
  const [childId, setChildId] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [gName, setGName] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [rel, setRel] = useState('parent');
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attest, setAttest] = useState(false);
  const [website, setWebsite] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await currentAccessToken();
      setSignedIn(Boolean(token));
      if (!token) return;
      const client = getClient();
      const [{ data: kids }, { data: u }] = await Promise.all([
        listChildren(client).then((r) => ({ data: r.data as Child[] | null })),
        client.auth.getUser(),
      ]);
      setChildren(kids ?? []);
      setGEmail(u.user?.email ?? '');
    })();
  }, []);

  const picked = children.find((c) => c.id === childId);
  const childFirst = picked?.first_name ?? first;
  const childLast = picked?.last_name ?? last;
  const childDob = picked?.date_of_birth ?? dob;

  function checkStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!childFirst.trim()) e.first = 'Enter the child’s first name';
      if (!childLast.trim()) e.last = 'Enter the child’s last name';
      if (!childDob) e.dob = 'Enter the child’s date of birth';
      if (!gName.trim()) e.gName = 'Enter your name';
      if (!/^\S+@\S+\.\S+$/.test(gEmail.trim())) e.gEmail = 'Enter a valid email';
    }
    if (s === 1 && schema) {
      const r = validateAnswers(schema, answers);
      if (!r.ok) Object.assign(e, r.errors);
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!schema) return;
    if (!checkStep(0) || !checkStep(1)) {
      setStep(0);
      return;
    }
    setBusy(true);
    setFormError(null);
    const r = await callRegistrationFn<Record<string, unknown>>(
      edgeConfig,
      'submit-registration',
      {
        slug: event.slug,
        formVersionId: event.form.version_id,
        guardianName: gName,
        guardianEmail: gEmail,
        ...(gPhone ? { guardianPhone: gPhone } : {}),
        guardianRelationship: rel,
        playerFirstName: childFirst,
        playerLastName: childLast,
        playerDateOfBirth: childDob,
        ...(picked ? { playerId: picked.id } : {}),
        guardianAttestation: attest,
        answers,
        ...(captcha ? { captchaToken: captcha } : {}),
        website,
      },
      await currentAccessToken(),
    );
    setBusy(false);
    if (!r.ok) {
      const code = r.body.error;
      if (code === 'invalid_answers' && r.body.fields && typeof r.body.fields === 'object') {
        setErrors(r.body.fields as Record<string, string>);
        setStep(1);
      }
      setFormError(registrationErrorMessage(code));
      setCaptcha(null);
      setCaptchaKey((k) => k + 1);
      return;
    }
    setOutcome({
      displayId: String(r.body.displayId ?? ''),
      ...(r.body.registrationId ? { registrationId: String(r.body.registrationId) } : {}),
      status: String(r.body.status ?? 'pending_verification'),
      next: (r.body.next as string[]) ?? [],
      waiverVersionIds: (r.body.waiverVersionIds as string[]) ?? [],
    });
  }

  if (!schema)
    return (
      <Text role="alert" className={styles.err}>
        This registration form could not be loaded. Contact the organizer.
      </Text>
    );
  if (outcome)
    return (
      <Confirmation
        event={event}
        outcome={outcome}
        guardian={{ name: gName, email: gEmail, relationship: rel }}
        signedIn={Boolean(signedIn)}
      />
    );

  return (
    <Card>
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 2) {
            if (checkStep(step)) setStep(step + 1);
          } else void submit();
        }}
        noValidate
      >
        <ol className={styles.steps} aria-label="Registration steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`${styles.step} ${i === step ? styles.stepActive : ''}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className={styles.stack}>
            <Heading as="h2">Who is registering?</Heading>
            {children.length > 0 && (
              <Select
                label="Choose a child"
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                options={[
                  { value: '', label: 'Someone else' },
                  ...children.map((c) => ({
                    value: c.id,
                    label: `${c.first_name} ${c.last_name}`,
                  })),
                ]}
              />
            )}
            {!picked && (
              <>
                <TextField
                  label="Child’s first name"
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  error={errors.first}
                />
                <TextField
                  label="Child’s last name"
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  error={errors.last}
                />
                <TextField
                  label="Child’s date of birth"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  error={errors.dob}
                />
              </>
            )}
            <Heading as="h2">Parent or guardian</Heading>
            <Text muted>Registrations are completed by a parent or legal guardian.</Text>
            <TextField
              label="Your name"
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              autoComplete="name"
              error={errors.gName}
            />
            <TextField
              label="Your email"
              type="email"
              value={gEmail}
              onChange={(e) => setGEmail(e.target.value)}
              autoComplete="email"
              error={errors.gEmail}
              hint="We send your confirmation here."
            />
            <TextField
              label="Phone (optional)"
              type="tel"
              value={gPhone}
              onChange={(e) => setGPhone(e.target.value)}
              autoComplete="tel"
            />
            <Select
              label="You are the child’s"
              value={rel}
              onChange={(e) => setRel(e.target.value)}
              options={RELATIONSHIPS}
            />
          </div>
        )}

        {step === 1 && (
          <div className={styles.stack}>
            <Heading as="h2">Registration details</Heading>
            {schema.fields.length === 0 ? (
              <Text muted>No extra questions for this event.</Text>
            ) : null}
            <FormRenderer schema={schema} answers={answers} errors={errors} onChange={setAnswers} />
          </div>
        )}

        {step === 2 && (
          <div className={styles.stack}>
            <Heading as="h2">Review</Heading>
            <dl className={styles.factGrid}>
              <div className={styles.fact}>
                <dt>Child</dt>
                <dd>
                  {childFirst} {childLast}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Parent or guardian</dt>
                <dd>
                  {gName} · {gEmail}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Price</dt>
                <dd>
                  {registrationPriceLabel(event.price_cents)}
                  {event.price_cents && event.payment_timing === 'after_acceptance'
                    ? ' (due after acceptance)'
                    : ''}
                </dd>
              </div>
            </dl>
            {event.waivers.length > 0 && (
              <Text muted>
                You will sign {event.waivers.length} waiver{event.waivers.length > 1 ? 's' : ''}{' '}
                next.
              </Text>
            )}
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={attest}
                onChange={(e) => setAttest(e.target.checked)}
              />
              I am this child’s parent or legal guardian.
            </label>
            <div className={styles.honey} aria-hidden="true">
              <label>
                Leave this empty
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>
            <Captcha onToken={setCaptcha} resetKey={captchaKey} />
          </div>
        )}

        {formError ? (
          <Text role="alert" className={styles.err}>
            {formError}
          </Text>
        ) : null}
        <div className={styles.row}>
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button type="submit" disabled={busy || (step === 2 && (!attest || !captcha))}>
            {step < 2
              ? 'Continue'
              : busy
                ? 'Submitting…'
                : event.price_cents && event.payment_timing === 'at_submission'
                  ? 'Submit and pay'
                  : 'Submit registration'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Confirmation({
  event,
  outcome,
  guardian,
  signedIn,
}: {
  event: PublicRegistration;
  outcome: Outcome;
  guardian: { name: string; email: string; relationship: string };
  signedIn: boolean;
}) {
  const [waivers, setWaivers] = useState<WaiverToSign[]>([]);
  const [reload, setReload] = useState(0);
  const pendingEmail = outcome.status === 'pending_verification';
  useEffect(() => {
    if (!signedIn || !outcome.registrationId || pendingEmail) return;
    void (async () => {
      const client = getClient();
      const { data } = await client.rpc('get_registration_detail', {
        p_registration_id: outcome.registrationId!,
      });
      const d = data as {
        waivers?: { waiver_version_id: string; title: string; acceptance_id: string | null }[];
      } | null;
      const ids = (d?.waivers ?? []).map((w) => w.waiver_version_id);
      if (!ids.length) return setWaivers([]);
      const { data: vs } = await client
        .from('waiver_versions')
        .select('id, title, body')
        .in('id', ids);
      setWaivers(
        (vs ?? []).map((v) => ({
          versionId: v.id,
          title: v.title,
          body: v.body,
          signed: Boolean(d?.waivers?.find((w) => w.waiver_version_id === v.id)?.acceptance_id),
        })),
      );
    })();
  }, [signedIn, outcome.registrationId, pendingEmail, reload]);

  return (
    <Card>
      <div className={styles.stack} role="status" aria-live="polite">
        <Heading as="h2">{pendingEmail ? 'Check your email' : 'You’re registered'}</Heading>
        {pendingEmail ? (
          <Text as="p">
            We sent a link to <strong>{guardian.email}</strong>. Open it to confirm your
            registration for {event.title}. It expires in an hour.
          </Text>
        ) : (
          <Text as="p">Your registration for {event.title} was received.</Text>
        )}
        {outcome.displayId ? <Text variant="mono">Reference {outcome.displayId}</Text> : null}
        {!pendingEmail && waivers.some((w) => !w.signed) && outcome.registrationId ? (
          <WaiverSigner
            waivers={waivers}
            registrationId={outcome.registrationId}
            defaults={guardian}
            onChanged={() => setReload((n) => n + 1)}
          />
        ) : null}
        {outcome.next.includes('pay') && (
          <Link href="/pay">
            <Button>Pay now</Button>
          </Link>
        )}
        {signedIn ? (
          <Link href="/registrations">View my registrations</Link>
        ) : (
          <Text muted>Didn’t get it? Check spam, or register again in a few minutes.</Text>
        )}
      </div>
    </Card>
  );
}

import {
  formSchemaSchema,
  infoBlocksSchema,
  registrationErrorMessage,
  registrationPriceLabel,
  validateAnswers,
  type FormSchema,
  type InfoBlock,
} from '@athleit/core';
import { listChildren } from '@athleit/db/api';
import { callRegistrationFn, type PublicRegistration } from '@athleit/db/registration';
import { space } from '@athleit/tokens';
import { parseIso, todayIso } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Choice, FormMessage, H1, H2, Segmented } from '@/components/app/kit';
import { Badge, Button, Card, Chip, DatePicker, Text, TextField } from '@/components/ui';
import {
  accessToken,
  edgeConfig,
  RELATIONSHIPS,
  solveCaptcha,
  WEB_ORIGIN,
} from '@/lib/registration';
import { supabase } from '@/lib/supabase';

import { FormFields, type Answers } from './form-fields';
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
}
const STEPS = [
  { value: '0', label: '1. Child' },
  { value: '1', label: '2. Details' },
  { value: '2', label: '3. Review' },
] as const;

export function InfoBlocksView({ blocks }: { blocks: InfoBlock[] }) {
  return (
    <View style={{ gap: space[4] }}>
      {blocks.map((b, i) => {
        if (b.type === 'description')
          return (
            <View key={i} style={{ gap: space[2] }}>
              {b.title ? <H2>{b.title}</H2> : null}
              <Text>{b.body}</Text>
            </View>
          );
        if (b.type === 'key_facts')
          return (
            <View key={i} style={{ gap: space[2] }}>
              {b.items.map((it, j) => (
                <View key={j}>
                  <Text variant="caption" muted>
                    {it.label}
                  </Text>
                  <Text variant="bodyBold">{it.value}</Text>
                </View>
              ))}
            </View>
          );
        const rows =
          b.type === 'agenda'
            ? b.items.map((x) => `${x.time ? `${x.time}  ` : ''}${x.label}`)
            : b.type === 'what_to_bring'
              ? b.items
              : b.items.map((x) => `${x.question}\n${x.answer}`);
        return (
          <View key={i} style={{ gap: space[2] }}>
            <H2>
              {b.type === 'agenda'
                ? (b.title ?? 'Schedule')
                : b.type === 'what_to_bring'
                  ? 'What to bring'
                  : 'Questions'}
            </H2>
            {rows.map((r, j) => (
              <Text key={j}>{r}</Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Mobile registrant flow: child and guardian, the published form, review (guardian attestation + human check). */
export function RegisterFlow({ event }: { event: PublicRegistration }) {
  const router = useRouter();
  const schema = useMemo<FormSchema | null>(() => {
    const p = formSchemaSchema.safeParse(event.form.schema);
    return p.success ? p.data : null;
  }, [event.form.schema]);
  const [children, setChildren] = useState<Child[]>([]);
  const [step, setStep] = useState(0);
  const [childId, setChildId] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [gName, setGName] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [rel, setRel] = useState<'parent' | 'legal_guardian'>('parent');
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: kids }, { data: u }] = await Promise.all([
        listChildren(supabase).then((r) => ({ data: r.data as Child[] | null })),
        supabase.auth.getUser(),
      ]);
      setChildren(kids ?? []);
      setGEmail(u.user?.email ?? '');
    })();
  }, []);

  const picked = children.find((c) => c.id === childId);
  const cFirst = picked?.first_name ?? first;
  const cLast = picked?.last_name ?? last;
  const cDob = picked?.date_of_birth ?? dob;

  function check(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!cFirst.trim()) e.first = 'Enter the child’s first name';
      if (!cLast.trim()) e.last = 'Enter the child’s last name';
      if (!parseIso(cDob)) e.dob = 'Choose the child’s date of birth';
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
    if (!check(0)) return setStep(0);
    if (!check(1)) return setStep(1);
    setBusy(true);
    setFormError(null);
    const captcha = await solveCaptcha();
    if (!captcha) {
      setBusy(false);
      return setFormError(
        WEB_ORIGIN
          ? registrationErrorMessage('captcha_failed')
          : 'Registration needs the web address configured for this build.',
      );
    }
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
        playerFirstName: cFirst,
        playerLastName: cLast,
        playerDateOfBirth: cDob,
        ...(picked ? { playerId: picked.id } : {}),
        guardianAttestation: attest,
        answers,
        captchaToken: captcha,
        website: '',
      },
      await accessToken(),
    );
    setBusy(false);
    if (!r.ok) {
      if (
        r.body.error === 'invalid_answers' &&
        r.body.fields &&
        typeof r.body.fields === 'object'
      ) {
        setErrors(r.body.fields as Record<string, string>);
        setStep(1);
      }
      return setFormError(registrationErrorMessage(r.body.error));
    }
    setOutcome({
      displayId: String(r.body.displayId ?? ''),
      ...(r.body.registrationId ? { registrationId: String(r.body.registrationId) } : {}),
      status: String(r.body.status ?? 'submitted'),
      next: (r.body.next as string[]) ?? [],
    });
  }

  if (!schema)
    return (
      <FormMessage error="This registration form could not be loaded. Contact the organizer." />
    );
  if (outcome)
    return (
      <Confirmation
        event={event}
        outcome={outcome}
        guardian={{ name: gName, email: gEmail, relationship: rel }}
        onPay={() => router.push('/pay' as never)}
        onList={() => router.replace('/registrations' as never)}
      />
    );

  return (
    <Card style={{ gap: space[4] }}>
      <Segmented
        value={String(step) as '0' | '1' | '2'}
        options={STEPS}
        onChange={(v) => {
          const n = Number(v);
          if (n <= step || check(step)) setStep(n);
        }}
      />
      {step === 0 && (
        <View style={{ gap: space[4] }}>
          <H2>Who is registering?</H2>
          {children.length > 0 && (
            <Choice
              label="Choose a child"
              value={childId}
              options={[
                { value: '', label: 'Someone else' },
                ...children.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` })),
              ]}
              onChange={setChildId}
            />
          )}
          {!picked && (
            <>
              <TextField
                label="Child’s first name"
                value={first}
                onChangeText={setFirst}
                error={errors.first}
              />
              <TextField
                label="Child’s last name"
                value={last}
                onChangeText={setLast}
                error={errors.last}
              />
              <DatePicker
                label="Child’s date of birth"
                value={dob}
                onChange={setDob}
                max={todayIso()}
                yearSpan={{ before: 25, after: 0 }}
                error={errors.dob}
              />
            </>
          )}
          <H2>Parent or guardian</H2>
          <Text muted>Registrations are completed by a parent or legal guardian.</Text>
          <TextField
            label="Your name"
            value={gName}
            onChangeText={setGName}
            autoComplete="name"
            error={errors.gName}
          />
          <TextField
            label="Your email"
            value={gEmail}
            onChangeText={setGEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.gEmail}
            hint="We send your confirmation here."
          />
          <TextField
            label="Phone (optional)"
            value={gPhone}
            onChangeText={setGPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Choice
            label="You are the child’s"
            value={rel}
            options={RELATIONSHIPS}
            onChange={setRel}
          />
        </View>
      )}
      {step === 1 && (
        <View style={{ gap: space[4] }}>
          <H2>Registration details</H2>
          {schema.fields.length === 0 ? (
            <Text muted>No extra questions for this event.</Text>
          ) : null}
          <FormFields schema={schema} answers={answers} errors={errors} onChange={setAnswers} />
        </View>
      )}
      {step === 2 && (
        <View style={{ gap: space[4] }}>
          <H2>Review</H2>
          <Text>
            {cFirst} {cLast}
          </Text>
          <Text muted>
            {gName} · {gEmail}
          </Text>
          <Text variant="bodyBold">
            {registrationPriceLabel(event.price_cents)}
            {event.price_cents && event.payment_timing === 'after_acceptance'
              ? ' (due after acceptance)'
              : ''}
          </Text>
          {event.waivers.length > 0 ? (
            <Text muted>
              You will sign {event.waivers.length} waiver{event.waivers.length > 1 ? 's' : ''} next.
            </Text>
          ) : null}
          <Chip
            label="I am this child’s parent or legal guardian"
            selected={attest}
            onPress={() => setAttest(!attest)}
          />
          <Text variant="caption" muted>
            A quick human check opens before we submit.
          </Text>
        </View>
      )}
      <FormMessage error={formError} />
      <View style={{ gap: space[3] }}>
        {step < 2 ? (
          <Button title="Continue" onPress={() => check(step) && setStep(step + 1)} />
        ) : (
          <Button
            title={
              busy
                ? 'Submitting…'
                : event.price_cents && event.payment_timing === 'at_submission'
                  ? 'Submit and pay'
                  : 'Submit registration'
            }
            loading={busy}
            disabled={busy || !attest}
            onPress={() => void submit()}
          />
        )}
        {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} />}
      </View>
    </Card>
  );
}

function Confirmation({
  event,
  outcome,
  guardian,
  onPay,
  onList,
}: {
  event: PublicRegistration;
  outcome: Outcome;
  guardian: { name: string; email: string; relationship: string };
  onPay: () => void;
  onList: () => void;
}) {
  const [waivers, setWaivers] = useState<WaiverToSign[]>([]);
  const [tick, setTick] = useState(0);
  const pending = outcome.status === 'pending_verification';
  useEffect(() => {
    if (!outcome.registrationId || pending) return;
    void (async () => {
      const { data } = await supabase.rpc('get_registration_detail', {
        p_registration_id: outcome.registrationId!,
      });
      const d = data as {
        waivers?: { waiver_version_id: string; acceptance_id: string | null }[];
      } | null;
      const ids = (d?.waivers ?? []).map((w) => w.waiver_version_id);
      if (!ids.length) return setWaivers([]);
      const { data: vs } = await supabase
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
  }, [outcome.registrationId, pending, tick]);
  return (
    <Card style={{ gap: space[4] }}>
      <H1>{pending ? 'Check your email' : 'You’re registered'}</H1>
      <Text>
        {pending
          ? `We sent a link to ${guardian.email}. Open it to confirm your registration for ${event.title}.`
          : `Your registration for ${event.title} was received.`}
      </Text>
      {outcome.displayId ? <Badge>{`Reference ${outcome.displayId}`}</Badge> : null}
      {!pending && outcome.registrationId && waivers.some((w) => !w.signed) ? (
        <WaiverSigner
          waivers={waivers}
          registrationId={outcome.registrationId}
          defaults={guardian}
          onChanged={() => setTick((n) => n + 1)}
        />
      ) : null}
      {outcome.next.includes('pay') ? <Button title="Pay now" onPress={onPay} /> : null}
      <Button title="View my registrations" variant="secondary" onPress={onList} />
    </Card>
  );
}

export function parseBlocks(v: unknown): InfoBlock[] {
  const p = infoBlocksSchema.safeParse(v);
  return p.success ? p.data : [];
}

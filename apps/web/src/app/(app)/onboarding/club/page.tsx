'use client';

import {
  createClubSchema,
  fieldErrors,
  friendlyError,
  stepLabel,
  type FieldErrors,
} from '@athleit/core';
import { createClub, findClub } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { slugify } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import styles from '@/components/onboarding/onboarding.module.css';
import { ShareCard } from '@/components/onboarding/share-card';
import { HUB_DONE_KEY, setFlag } from '@/components/onboarding/storage';
import { Button, Card, PageHeader, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

type Step = 'club' | 'teams' | 'done';
const NUMBER: Record<Step, number> = { club: 1, teams: 2, done: 3 };
const TITLE: Record<Step, string> = {
  club: 'Create your club',
  teams: 'Bring in your teams',
  done: 'You’re set',
};

/** Club path: create the club (checking the address first), then share the address teams use to ask in. */
export default function ClubPathPage() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const client = getClient();
  const [step, setStep] = useState<Step>('club');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'slug'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clubName, setClubName] = useState('');

  async function check(value: string) {
    if (!value) return setAvailable(null);
    const res = await findClub(client, value);
    if (!res.error) setAvailable(res.data.length === 0);
  }

  async function submit() {
    const parsed = createClubSchema.safeParse({ name, slug });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const taken = await findClub(client, parsed.data.slug);
    if (!taken.error && taken.data.length > 0) {
      setBusy(false);
      return setAvailable(false);
    }
    const res = await createClub(client, parsed.data);
    setBusy(false);
    if (res.error || !res.data) {
      if (/clubs_slug_key/.test(res.error?.message ?? '')) return setAvailable(false);
      return setError(friendlyError(res.error));
    }
    setClubName(parsed.data.name);
    void refresh();
    setActive(`club:${res.data}`);
    setFlag(HUB_DONE_KEY);
    setStep('teams');
  }

  return (
    <>
      <PageHeader title={TITLE[step]} subtitle={stepLabel('club', NUMBER[step]) ?? undefined} />
      {step === 'club' ? (
        <Card className={styles.stack}>
          <TextField
            label="Club name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!touched) {
                setSlug(slugify(e.target.value));
                setAvailable(null);
              }
            }}
            error={errors.name}
          />
          <TextField
            label="Web address"
            hint="Teams use this to find your club. Lowercase letters, numbers and hyphens."
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(e.target.value);
              setAvailable(null);
            }}
            onBlur={() => void check(slug)}
            autoCapitalize="none"
            autoComplete="off"
            mono
            error={errors.slug}
          />
          {available === true ? (
            <p role="status" className={styles.muted}>
              That address is available
            </p>
          ) : null}
          {available === false ? (
            <p role="alert" className={styles.muted}>{`That address is taken. Try ${slug}-2.`}</p>
          ) : null}
          <FormMessage error={error} />
          <Button size="lg" loading={busy} onClick={() => void submit()}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'teams' ? (
        <Card className={styles.stack}>
          <p className={styles.muted}>
            Coaches add their team to your club using your web address. You approve each one.
          </p>
          <ShareCard
            label="Club web address"
            value={slug}
            shareMessage={`Add your team to ${clubName} on Athleit. When you create the team, enter this club web address: ${slug}`}
          />
          <Button size="lg" onClick={() => setStep('done')}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card className={styles.stack} data-testid="club-done">
          <h2 style={{ margin: 0 }}>{`${clubName} is ready`}</h2>
          <p className={styles.muted}>
            Teams that ask to join will show up on your Home for approval.
          </p>
          <Button size="lg" onClick={() => router.replace('/')}>
            Go to Home
          </Button>
        </Card>
      ) : null}
    </>
  );
}

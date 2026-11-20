import {
  createClubSchema,
  fieldErrors,
  friendlyError,
  stepLabel,
  type FieldErrors,
} from '@athleit/core';
import { createClub, findClub } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { ShareCard } from '@/components/onboarding/share-card';
import { Button, Card, Text, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { HUB_DONE_KEY, kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

type Step = 'club' | 'teams' | 'done';
const NUMBER: Record<Step, number> = { club: 1, teams: 2, done: 3 };
const TITLE: Record<Step, string> = {
  club: 'Create your club',
  teams: 'Bring in your teams',
  done: 'You’re set',
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

/** Club path: create the club (checking the address first), then share the address teams use to ask in. */
export default function ClubPathScreen() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [step, setStep] = useState<Step>('club');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'slug'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clubName, setClubName] = useState('');

  useScreenTitle(TITLE[step], stepLabel('club', NUMBER[step]) ?? undefined);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => step === 'teams');
    return () => sub.remove();
  }, [step]);

  async function check(value: string) {
    if (!value) return setAvailable(null);
    const res = await findClub(supabase, value);
    if (!res.error) setAvailable(res.data.length === 0);
  }

  async function submit() {
    const parsed = createClubSchema.safeParse({ name, slug });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const taken = await findClub(supabase, parsed.data.slug);
    if (!taken.error && taken.data.length > 0) {
      setBusy(false);
      setAvailable(false);
      return;
    }
    const res = await createClub(supabase, parsed.data);
    setBusy(false);
    if (res.error || !res.data) {
      if (/clubs_slug_key/.test(res.error?.message ?? '')) return setAvailable(false);
      return setError(friendlyError(res.error));
    }
    setClubName(parsed.data.name);
    void refresh();
    setActive(`club:${res.data}`);
    void kv.set(HUB_DONE_KEY, '1');
    setStep('teams');
  }

  return (
    <AppScreen>
      {step === 'club' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Create your club</H1>
          <TextField
            label="Club name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (!touched) {
                const next = slugify(v);
                setSlug(next);
                setAvailable(null);
              }
            }}
            error={errors.name}
          />
          <TextField
            label="Web address"
            hint="Teams use this to find your club. Lowercase letters, numbers and hyphens."
            value={slug}
            onChangeText={(v) => {
              setTouched(true);
              setSlug(v);
              setAvailable(null);
            }}
            onBlur={() => void check(slug)}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            error={errors.slug}
          />
          {available === true ? <Notice tone="success">That address is available</Notice> : null}
          {available === false ? (
            <Notice tone="error">{`That address is taken. Try ${slug}-2.`}</Notice>
          ) : null}
          <FormMessage error={error} />
          <Button title="Continue" size="lg" loading={busy} onPress={() => void submit()} />
        </Card>
      ) : null}

      {step === 'teams' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Bring in your teams</H1>
          <Text muted>
            Coaches add their team to your club using your web address. You approve each one.
          </Text>
          <ShareCard
            label="CLUB WEB ADDRESS"
            value={slug}
            shareMessage={`Add your team to ${clubName} on Athleit. When you create the team, enter this club web address: ${slug}`}
          />
          <Button title="Continue" size="lg" onPress={() => setStep('done')} />
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card style={{ gap: space[4] }} testID="club-done">
          <H1>{`${clubName} is ready`}</H1>
          <Text muted>Teams that ask to join will show up on your Home for approval.</Text>
          <Button title="Go to Home" size="lg" onPress={() => router.replace('/')} />
        </Card>
      ) : null}
    </AppScreen>
  );
}

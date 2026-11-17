import { createClubSchema, fieldErrors, friendlyError, type FieldErrors } from '@athleit/core';
import { createClub } from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1 } from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

export default function NewClubScreen() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'slug'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = createClubSchema.safeParse({ name, slug });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const res = await createClub(supabase, parsed.data);
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    setActive(`club:${res.data}:admin`);
    router.replace(`/clubs/${res.data}`);
  }

  return (
    <AppScreen>
      <Card style={{ gap: spacing[4] }}>
        <H1>Create a club</H1>
        <Text muted>A club groups teams. Teams ask to join it and you approve each one.</Text>
        <TextField
          label="Club name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (!touched) setSlug(slugify(v));
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
          }}
          autoCapitalize="none"
          mono
          error={errors.slug}
        />
        <FormMessage error={error} />
        <Button title="Create club" loading={busy} onPress={() => void submit()} />
      </Card>
    </AppScreen>
  );
}

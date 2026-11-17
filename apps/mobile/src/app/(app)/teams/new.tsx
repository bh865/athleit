import {
  createTeamSchema,
  fieldErrors,
  friendlyError,
  SPORTS,
  type FieldErrors,
} from '@athleit/core';
import { createTeam, findClub } from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Choice, FormMessage, H1 } from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

export default function NewTeamScreen() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<(typeof SPORTS)[number]>('soccer');
  const [season, setSeason] = useState('');
  const [clubSlug, setClubSlug] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel' | 'clubSlug'>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = createTeamSchema.safeParse({ name, sport, seasonLabel: season });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    let clubId: string | undefined;
    if (clubSlug.trim()) {
      const found = await findClub(supabase, clubSlug);
      if (found.error) {
        setBusy(false);
        return setError(friendlyError(found.error));
      }
      if (!found.data[0]) {
        setBusy(false);
        return setErrors({ clubSlug: 'No club has that web address.' });
      }
      clubId = found.data[0].id;
    }
    const res = await createTeam(supabase, { ...parsed.data, clubId });
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    setActive(`team:${res.data}:admin`);
    router.replace(`/teams/${res.data}`);
  }

  return (
    <AppScreen>
      <Card style={{ gap: spacing[4] }}>
        <H1>Create a team</H1>
        <Text muted>You’ll be the team’s admin. Teams don’t need a club.</Text>
        <TextField label="Team name" value={name} onChangeText={setName} error={errors.name} />
        <Choice label="Sport" value={sport} options={SPORT_OPTIONS} onChange={setSport} />
        <TextField
          label="Season"
          hint="For example, Fall 2026"
          value={season}
          onChangeText={setSeason}
          error={errors.seasonLabel}
        />
        <TextField
          label="Club web address (optional)"
          hint="If your team belongs to a club, enter its address. The club’s admin has to approve the link."
          value={clubSlug}
          onChangeText={setClubSlug}
          autoCapitalize="none"
          error={errors.clubSlug}
        />
        <FormMessage error={error} />
        <View>
          <Button title="Create team" loading={busy} onPress={() => void submit()} />
        </View>
      </Card>
    </AppScreen>
  );
}

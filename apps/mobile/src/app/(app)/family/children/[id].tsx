import {
  ageOn,
  canHaveOwnLogin,
  fieldErrors,
  friendlyError,
  updateChildSchema,
  type FieldErrors,
} from '@athleit/core';
import { getChild, updateChild } from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { WEB_ORIGIN } from '@/components/app/invite-panel';
import {
  BackLink,
  Badge,
  FormMessage,
  H1,
  H2,
  ListItem,
  LoadState,
  Notice,
} from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Child = Extract<Awaited<ReturnType<typeof getChild>>, { error: null }>['data'];

function ChildForm({ c, onSaved }: { c: Child; onSaved: () => void }) {
  const [first, setFirst] = useState(c.first_name);
  const [last, setLast] = useState(c.last_name);
  const [dob, setDob] = useState(c.date_of_birth);
  const [email, setEmail] = useState(c.login_invite_email ?? '');
  const [errors, setErrors] = useState<
    FieldErrors<'firstName' | 'lastName' | 'dateOfBirth' | 'loginInviteEmail'>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function save() {
    const parsed = updateChildSchema.safeParse({
      firstName: first,
      lastName: last,
      dateOfBirth: dob,
      loginInviteEmail: email.trim() && canHaveOwnLogin(dob) ? email : null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await updateChild(supabase, c.id, parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSaved(true);
    if (parsed.data.loginInviteEmail) setLink(`${WEB_ORIGIN}/claim/${c.id}`);
    onSaved();
  }

  return (
    <Card style={{ gap: spacing[4] }}>
      <TextField
        label="First name"
        value={first}
        onChangeText={setFirst}
        error={errors.firstName}
      />
      <TextField label="Last name" value={last} onChangeText={setLast} error={errors.lastName} />
      <TextField
        label="Date of birth"
        hint="YYYY-MM-DD"
        value={dob}
        onChangeText={setDob}
        error={errors.dateOfBirth}
      />
      {canHaveOwnLogin(dob) ? (
        <TextField
          label="Their own login email (optional)"
          hint="Aged 13 or older, they can sign in themselves. If they sign up with this email, their login links to this profile automatically."
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.loginInviteEmail}
        />
      ) : (
        <Notice>
          Children under 13 have no login. You manage {c.first_name}’s profile and teams.
        </Notice>
      )}
      <FormMessage error={error} success={saved ? 'Saved.' : null} />
      <Button title="Save changes" loading={busy} onPress={() => void save()} />
      {link && (
        <Text size="sm" muted selectable>
          Send {c.first_name} this link to sign in: {link}
        </Text>
      )}
    </Card>
  );
}

export default function ChildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const child = useLoad(() => getChild(supabase, id), [id]);
  const c = child.data;

  return (
    <AppScreen>
      <BackLink label="Family" />
      <LoadState loading={child.loading} error={child.error} onRetry={child.reload}>
        {c && (
          <>
            <H1>
              {c.first_name} {c.last_name}
            </H1>
            <Text muted>{ageOn(c.date_of_birth)} years old</Text>
            <ChildForm key={c.id + c.date_of_birth} c={c} onSaved={child.reload} />
            {c.profile_id && <Badge tone="success">Has their own login</Badge>}

            <View style={{ gap: spacing[3] }}>
              <H2>Teams</H2>
              {c.team_players.length === 0 ? (
                <Notice>{c.first_name} isn’t on a team yet.</Notice>
              ) : (
                c.team_players.map((tp) => (
                  <ListItem
                    key={tp.id}
                    title={tp.teams?.name ?? 'Team'}
                    subtitle={`${tp.teams?.season_label ?? ''}${tp.jersey_number != null ? ` · #${tp.jersey_number}` : ''}${tp.position ? ` · ${tp.position}` : ''}`}
                    right={
                      <Badge tone={tp.status === 'active' ? 'success' : 'neutral'}>
                        {tp.status}
                      </Badge>
                    }
                  />
                ))
              )}
              <Button
                title={`Join a team with a code for ${c.first_name}`}
                variant="secondary"
                onPress={() => router.push({ pathname: '/join', params: { player: c.id } })}
              />
            </View>
          </>
        )}
      </LoadState>
    </AppScreen>
  );
}

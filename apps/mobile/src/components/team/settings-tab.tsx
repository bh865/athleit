import {
  createTeamSchema,
  fieldErrors,
  friendlyError,
  SPORTS,
  type FieldErrors,
} from '@athleit/core';
import {
  findClub,
  getClub,
  getLinkRequests,
  requestClubLink,
  unlinkTeamFromClub,
  updateTeam,
} from '@athleit/db/api';
import { space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useState } from 'react';
import { View } from 'react-native';

import { Choice, FormMessage } from '@/components/app/kit';
import { Badge, Button, Card, Icon, Text, TextField, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { ConfirmSheet, ListState } from './parts';
import { useTeam } from './team-context';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Settings: team name, sport and season, plus club affiliation. Admins edit; everyone else reads. */
export function SettingsTab() {
  const { team, caps, reload } = useTeam();
  const toast = useToast();
  const admin = caps.has('team.edit');
  const [name, setName] = useState(team.name);
  const [sport, setSport] = useState<(typeof SPORTS)[number]>(team.sport);
  const [season, setSeason] = useState(team.season_label);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = createTeamSchema.safeParse({ name, sport, seasonLabel: season });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setSaving(true);
    const res = await updateTeam(supabase, team.id, {
      name: parsed.data.name,
      sport: parsed.data.sport,
      season_label: parsed.data.seasonLabel,
    });
    setSaving(false);
    if (res.error) return setError(friendlyError(res.error));
    toast('Changes saved');
    reload();
  }

  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        <Text variant="heading">Team details</Text>
        {admin ? (
          <>
            <TextField label="Team name" value={name} onChangeText={setName} error={errors.name} />
            <Choice label="Sport" value={sport} options={SPORT_OPTIONS} onChange={setSport} />
            <TextField
              label="Season"
              value={season}
              onChangeText={setSeason}
              error={errors.seasonLabel}
            />
            <FormMessage error={error} />
            <Button
              title="Save changes"
              icon="check"
              loading={saving}
              onPress={() => void save()}
            />
          </>
        ) : (
          <>
            <Fact label="Team name" value={team.name} />
            <Fact label="Sport" value={cap(team.sport)} />
            <Fact label="Season" value={team.season_label} />
          </>
        )}
      </Card>
      <ClubAffiliation />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="bodyBold">{value}</Text>
    </View>
  );
}

type Link = 'none' | 'pending' | 'linked' | 'declined';
const BADGE: Record<
  Link,
  { icon: IconName; label: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }
> = {
  none: { icon: 'minus-circle', label: 'Not linked', tone: 'neutral' },
  pending: { icon: 'hourglass', label: 'Pending', tone: 'warning' },
  linked: { icon: 'link', label: 'Linked', tone: 'success' },
  declined: { icon: 'x-circle', label: 'Declined', tone: 'danger' },
};

function ClubAffiliation() {
  const { team, caps, reload } = useTeam();
  const admin = caps.has('team.requestClubLink');
  const links = useLoad(
    () => getLinkRequests(supabase, { teamId: team.id }),
    [team.id, team.club_id],
  );
  const club = useLoad(
    () =>
      team.club_id ? getClub(supabase, team.club_id) : Promise.resolve({ data: null, error: null }),
    [team.club_id],
  );
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);

  const latest = [...(links.data ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  const state: Link = team.club_id
    ? 'linked'
    : latest?.status === 'pending'
      ? 'pending'
      : latest?.status === 'declined'
        ? 'declined'
        : 'none';
  const clubName = club.data?.name ?? latest?.club_name ?? 'your club';

  async function request() {
    setError(null);
    setBusy(true);
    const found = await findClub(supabase, slug);
    const target = found.data?.[0];
    if (found.error || !target) {
      setBusy(false);
      return setError(found.error ? friendlyError(found.error) : 'No club has that web address.');
    }
    const res = await requestClubLink(supabase, team.id, target.id);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSlug('');
    links.reload();
  }
  async function doLeave() {
    setBusy(true);
    const res = await unlinkTeamFromClub(supabase, team.id);
    setBusy(false);
    setLeave(false);
    if (res.error) return setError(friendlyError(res.error));
    reload();
    links.reload();
  }

  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Club affiliation</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Icon name={BADGE[state].icon} size="sm" weight="fill" />
          <Badge tone={BADGE[state].tone}>{BADGE[state].label}</Badge>
        </View>
      </View>
      <ListState
        name="club affiliation"
        loading={links.loading}
        error={links.error}
        onRetry={links.reload}
      >
        {state === 'linked' ? (
          <>
            <Text variant="bodyBold">{clubName}</Text>
            <Text muted>Club admins can see your roster but can’t edit the team.</Text>
            {admin ? (
              <Button
                title="Leave club"
                icon="sign-out"
                variant="secondary"
                onPress={() => setLeave(true)}
              />
            ) : null}
            <FormMessage error={error} />
          </>
        ) : state === 'pending' ? (
          <Text muted>Waiting for {clubName} to approve.</Text>
        ) : !admin ? (
          <Text muted>This team isn’t linked to a club.</Text>
        ) : (
          <>
            <Text muted>
              {state === 'declined'
                ? 'The club declined this request. You can send a new one.'
                : 'Teams can exist on their own. To affiliate with a club, ask it: its admin approves the link.'}
            </Text>
            <TextField
              label="Club web address"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. riverside-youth-soccer"
              mono
            />
            <FormMessage error={error} />
            <Button
              title={state === 'declined' ? 'Request again' : 'Request link'}
              variant={state === 'declined' ? 'secondary' : 'primary'}
              loading={busy}
              disabled={!slug.trim()}
              onPress={() => void request()}
            />
          </>
        )}
      </ListState>
      <ConfirmSheet
        open={leave}
        title="Leave this club?"
        body="Club admins will no longer see your roster. You can ask to join again later."
        confirmLabel="Leave club"
        busy={busy}
        onConfirm={() => void doLeave()}
        onClose={() => setLeave(false)}
      />
    </Card>
  );
}

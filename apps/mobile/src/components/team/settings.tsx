import {
  createTeamSchema,
  fieldErrors,
  friendlyError,
  SPORTS,
  type FieldErrors,
} from '@athleit/core';
import {
  findClub,
  getLinkRequests,
  requestClubLink,
  rotateJoinCode,
  unlinkTeamFromClub,
  updateTeam,
} from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Choice, FormMessage, H2, ListItem, LoadState, Notice } from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from './team-context';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

export function SettingsSection() {
  const { team, caps, reload } = useTeam();
  const admin = caps.has('team.edit');
  const links = useLoad(
    () =>
      admin
        ? getLinkRequests(supabase, { teamId: team.id })
        : Promise.resolve({ data: [], error: null }),
    [team.id, team.club_id],
  );
  const [name, setName] = useState(team.name);
  const [sport, setSport] = useState<(typeof SPORTS)[number]>(team.sport);
  const [season, setSeason] = useState(team.season_label);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState(team.join_code);
  const [slug, setSlug] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  if (!admin) return <Notice>Only team admins can change settings.</Notice>;

  async function save() {
    const parsed = createTeamSchema.safeParse({ name, sport, seasonLabel: season });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    const res = await updateTeam(supabase, team.id, {
      name: parsed.data.name,
      sport: parsed.data.sport,
      season_label: parsed.data.seasonLabel,
    });
    if (res.error) return setError(friendlyError(res.error));
    setSaved(true);
    reload();
  }
  async function rotate() {
    const res = await rotateJoinCode(supabase, team.id);
    if (res.error) return setError(friendlyError(res.error));
    setCode(res.data);
  }
  async function requestLink() {
    setLinkError(null);
    setLinkNote(null);
    const found = await findClub(supabase, slug);
    if (found.error) return setLinkError(friendlyError(found.error));
    const club = found.data[0];
    if (!club) return setLinkError('No club has that web address.');
    const res = await requestClubLink(supabase, team.id, club.id);
    if (res.error) return setLinkError(friendlyError(res.error));
    setLinkNote(`Request sent to ${club.name}. The club’s admin has to approve it.`);
    setSlug('');
    links.reload();
  }
  async function unlink() {
    const res = await unlinkTeamFromClub(supabase, team.id);
    if (res.error) return setLinkError(friendlyError(res.error));
    reload();
    links.reload();
  }

  return (
    <View style={{ gap: spacing[4] }}>
      {caps.has('team.rotateCode') && (
        <Card style={{ gap: spacing[3] }}>
          <H2>Team code</H2>
          <Text muted>
            Families enter this code to ask to join. A code never grants access by itself; you
            approve each request.
          </Text>
          <Text size="2xl" mono selectable testID="join-code">
            {code}
          </Text>
          <Button title="Generate a new code" variant="secondary" onPress={() => void rotate()} />
        </Card>
      )}
      <Card style={{ gap: spacing[3] }}>
        <H2>Team details</H2>
        <TextField label="Team name" value={name} onChangeText={setName} error={errors.name} />
        <Choice label="Sport" value={sport} options={SPORT_OPTIONS} onChange={setSport} />
        <TextField
          label="Season"
          value={season}
          onChangeText={setSeason}
          error={errors.seasonLabel}
        />
        <FormMessage error={error} success={saved ? 'Saved.' : null} />
        <Button title="Save changes" onPress={() => void save()} />
      </Card>
      <Card style={{ gap: spacing[3] }}>
        <H2>Club</H2>
        {team.club_id ? (
          <>
            <Text>
              This team is part of a club. Club admins can see your roster but can’t edit the team.
            </Text>
            <Button title="Leave the club" variant="secondary" onPress={() => void unlink()} />
          </>
        ) : (
          <>
            <Text muted>
              Teams can exist on their own. To affiliate with a club, ask it: its admin approves the
              link.
            </Text>
            <TextField
              label="Club web address"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              mono
            />
            <FormMessage error={linkError} success={linkNote} />
            <Button
              title="Ask to join this club"
              variant="secondary"
              disabled={!slug.trim()}
              onPress={() => void requestLink()}
            />
          </>
        )}
        <LoadState loading={links.loading} error={links.error} empty={false} onRetry={links.reload}>
          {links.data?.map((l) => (
            <ListItem
              key={l.id}
              title={l.club_name}
              right={
                <Badge
                  tone={
                    l.status === 'approved'
                      ? 'success'
                      : l.status === 'pending'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {l.status}
                </Badge>
              }
            />
          ))}
        </LoadState>
      </Card>
    </View>
  );
}

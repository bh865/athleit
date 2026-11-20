import {
  createTeamSchema,
  fieldErrors,
  friendlyError,
  SPORTS,
  stepLabel,
  zonedTimeToInstant,
  type FieldErrors,
} from '@athleit/core';
import { createInvite, createTeam, findClub, getTeam } from '@athleit/db/api';
import { createEvent } from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { todayIso } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Choice, FormMessage, H1, ListItem, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { WEB_ORIGIN } from '@/components/app/invite-panel';
import { ShareCard } from '@/components/onboarding/share-card';
import { Button, Card, DatePicker, ListGroup, Text, TextField, TimePicker } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { HUB_DONE_KEY, kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { viewerZone } from '@/lib/viewer-zone';

type Step = 'team' | 'invite' | 'event' | 'done';
const NUMBER: Record<Step, number> = { team: 1, invite: 2, event: 3, done: 4 };
const TITLE: Record<Step, string> = {
  team: 'Create your team',
  invite: 'Invite your families',
  event: 'Add a practice or game',
  done: 'You’re set',
};
const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));
const EVENT_MINUTES = 90;

/**
 * Coach path: create the team, share the code (and, if wanted, a link and QR), optionally add a first
 * event, then land on Home where the setup tile carries on. Nothing here gives families access: the
 * code only creates requests you approve.
 */
export default function CoachPathScreen() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [step, setStep] = useState<Step>('team');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [sport, setSport] = useState<(typeof SPORTS)[number]>('soccer');
  const [season, setSeason] = useState('');
  const [inClub, setInClub] = useState(false);
  const [clubSlug, setClubSlug] = useState('');
  const [clubFound, setClubFound] = useState<{ id: string; name: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel' | 'clubSlug'>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [addingEvent, setAddingEvent] = useState(false);
  const [type, setType] = useState<'practice' | 'game'>('practice');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('17:30');
  const [place, setPlace] = useState('');
  const [eventError, setEventError] = useState<string | undefined>();

  useScreenTitle(TITLE[step], stepLabel('coach', NUMBER[step]) ?? undefined);

  // The team exists once created, so Back never returns to the form that would make a second one.
  const back = step === 'event' ? 'invite' : null;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!back) return false;
      setStep(back);
      return true;
    });
    return () => sub.remove();
  }, [back]);

  async function lookUpClub() {
    setClubFound(null);
    if (!clubSlug.trim()) return;
    const found = await findClub(supabase, clubSlug);
    if (found.error) return setError(friendlyError(found.error));
    const club = found.data[0];
    if (!club) return setErrors({ clubSlug: 'No club has that web address.' });
    setErrors({});
    setClubFound({ id: club.id, name: club.name });
  }

  async function createTheTeam() {
    const parsed = createTeamSchema.safeParse({ name, sport, seasonLabel: season });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    let clubId: string | undefined = inClub ? clubFound?.id : undefined;
    if (inClub && !clubId && clubSlug.trim()) {
      const found = await findClub(supabase, clubSlug);
      clubId = found.data?.[0]?.id;
      if (!clubId) {
        setBusy(false);
        return setErrors({ clubSlug: 'No club has that web address.' });
      }
    }
    const res = await createTeam(supabase, { ...parsed.data, clubId });
    if (res.error || !res.data) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    const id = res.data as string;
    const team = await getTeam(supabase, id);
    setBusy(false);
    setTeamId(id);
    setTeamName(parsed.data.name);
    setJoinCode(team.data?.join_code ?? '');
    void refresh();
    setActive(`team:${id}`);
    void kv.set(HUB_DONE_KEY, '1');
    setStep('invite');
  }

  async function makeLink() {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    const res = await createInvite(supabase, {
      target: { teamId },
      role: 'parent',
      expiresInDays: 30,
      maxUses: 200,
    });
    setBusy(false);
    const row = res.data?.[0];
    if (res.error || !row) return setError(friendlyError(res.error));
    setLink(`${WEB_ORIGIN}/invite/${row.token}`);
  }

  async function addEvent() {
    if (!teamId) return;
    if (!date) return setEventError('Choose a date.');
    setEventError(undefined);
    setBusy(true);
    const zone = viewerZone();
    const start = zonedTimeToInstant(date, time, zone);
    const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
    const res = await createEvent(supabase, {
      team_id: teamId,
      type,
      title: title.trim() || (type === 'game' ? 'Game' : 'Practice'),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      timezone: zone,
      location_text: place.trim() || null,
    });
    setBusy(false);
    if (res.error) return setEventError(friendlyError(res.error));
    setStep('done');
  }

  return (
    <AppScreen>
      {step === 'team' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Create your team</H1>
          <TextField label="Team name" value={name} onChangeText={setName} error={errors.name} />
          <Choice label="Sport" value={sport} options={SPORT_OPTIONS} onChange={setSport} />
          <TextField
            label="Season"
            hint="For example, Fall 2026"
            value={season}
            onChangeText={setSeason}
            error={errors.seasonLabel}
          />
          <Choice
            label="Part of a club?"
            value={inClub ? 'yes' : 'no'}
            onChange={(v) => setInClub(v === 'yes')}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
          {inClub ? (
            <>
              <TextField
                label="Club web address"
                hint="The club approves your request."
                value={clubSlug}
                onChangeText={(v) => {
                  setClubSlug(v);
                  setClubFound(null);
                }}
                onBlur={() => void lookUpClub()}
                autoCapitalize="none"
                autoCorrect={false}
                mono
                error={errors.clubSlug}
              />
              {clubFound ? (
                <Notice tone="success">{`${clubFound.name} found. A request will be sent after you create the team.`}</Notice>
              ) : null}
            </>
          ) : null}
          <FormMessage error={error} />
          <Button title="Continue" size="lg" loading={busy} onPress={() => void createTheTeam()} />
        </Card>
      ) : null}

      {step === 'invite' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Invite your families</H1>
          <Text muted>Share the team code. Parents send a request; you approve each one.</Text>
          <ShareCard
            label="TEAM CODE"
            value={joinCode}
            shareMessage={`Join ${teamName} on Athleit with the team code ${joinCode}.`}
          />
          {link ? (
            <ShareCard
              label="INVITE LINK"
              value={link}
              shareMessage={`Join ${teamName} on Athleit: ${link}`}
              qr
            />
          ) : (
            <View style={{ gap: space[2] }}>
              <Button
                title="Create an invite link"
                variant="secondary"
                loading={busy}
                onPress={() => void makeLink()}
              />
              <Text variant="caption" muted>
                Anyone with the link joins as a parent right away, so share it only with your
                families. The code always waits for your approval.
              </Text>
            </View>
          )}
          <Text variant="caption" muted>
            Parents only see the team after you approve them.
          </Text>
          <FormMessage error={error} />
          <Button title="Continue" size="lg" onPress={() => setStep('event')} />
        </Card>
      ) : null}

      {step === 'event' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Add your first practice or game</H1>
          <Text muted>Optional. Families see it as soon as they join.</Text>
          {addingEvent ? (
            <>
              <Choice
                label="Type"
                value={type}
                onChange={setType}
                options={[
                  { value: 'practice', label: 'Practice' },
                  { value: 'game', label: 'Game' },
                ]}
              />
              <TextField
                label="Title"
                value={title}
                onChangeText={setTitle}
                placeholder={type === 'game' ? 'Game' : 'Practice'}
              />
              <DatePicker
                label="Date"
                value={date}
                onChange={setDate}
                min={todayIso()}
                error={eventError}
              />
              <TimePicker label="Time" value={time} onChange={setTime} />
              <TextField label="Place" value={place} onChangeText={setPlace} />
              <Button title="Add event" size="lg" loading={busy} onPress={() => void addEvent()} />
            </>
          ) : (
            <ListGroup>
              <ListItem
                title="New event"
                subtitle="Type, date, time and place."
                onPress={() => setAddingEvent(true)}
              />
            </ListGroup>
          )}
          <Button title="Do this later" variant="secondary" onPress={() => setStep('done')} />
          <Button title="Back" variant="ghost" onPress={() => setStep('invite')} />
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card style={{ gap: space[4] }} testID="coach-done">
          <H1>{`${teamName} is ready`}</H1>
          <Text muted>Three things left. They’re on your Home.</Text>
          <ListGroup>
            <ListItem title="Invite families" subtitle="Share your link or code" />
            <ListItem title="Add your schedule" subtitle="Practices and games" />
            <ListItem title="Build your roster" subtitle="Approve requests, then add players" />
          </ListGroup>
          <Button title="Go to Home" size="lg" onPress={() => router.replace('/')} />
        </Card>
      ) : null}
    </AppScreen>
  );
}

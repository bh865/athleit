'use client';

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
import { todayIso } from '@athleit/ui-core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { FormMessage } from '@/components/app/states';
import { Choice } from '@/components/onboarding/choice';
import styles from '@/components/onboarding/onboarding.module.css';
import { ShareCard } from '@/components/onboarding/share-card';
import { HUB_DONE_KEY, setFlag } from '@/components/onboarding/storage';
import { Button, Card, DatePicker, PageHeader, TextField, TimePicker } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

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
export default function CoachPathPage() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const client = getClient();
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

  async function lookUpClub() {
    setClubFound(null);
    if (!clubSlug.trim()) return;
    const found = await findClub(client, clubSlug);
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
      const found = await findClub(client, clubSlug);
      clubId = found.data?.[0]?.id;
      if (!clubId) {
        setBusy(false);
        return setErrors({ clubSlug: 'No club has that web address.' });
      }
    }
    const res = await createTeam(client, { ...parsed.data, clubId });
    if (res.error || !res.data) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    const id = res.data as string;
    const team = await getTeam(client, id);
    setBusy(false);
    setTeamId(id);
    setTeamName(parsed.data.name);
    setJoinCode(team.data?.join_code ?? '');
    void refresh();
    setActive(`team:${id}`);
    setFlag(HUB_DONE_KEY);
    setStep('invite');
  }

  async function makeLink() {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    const res = await createInvite(client, {
      target: { teamId },
      role: 'parent',
      expiresInDays: 30,
      maxUses: 200,
    });
    setBusy(false);
    const row = res.data?.[0];
    if (res.error || !row) return setError(friendlyError(res.error));
    setLink(`${window.location.origin}/invite/${row.token}`);
  }

  async function addEvent() {
    if (!teamId) return;
    if (!date) return setEventError('Choose a date.');
    setEventError(undefined);
    setBusy(true);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const start = zonedTimeToInstant(date, time, zone);
    const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
    const res = await createEvent(client, {
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
    <>
      <PageHeader title={TITLE[step]} subtitle={stepLabel('coach', NUMBER[step]) ?? undefined} />
      {step === 'team' ? (
        <Card className={styles.stack}>
          <TextField
            label="Team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <Choice label="Sport" value={sport} options={SPORT_OPTIONS} onChange={setSport} />
          <TextField
            label="Season"
            hint="For example, Fall 2026"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
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
                onChange={(e) => {
                  setClubSlug(e.target.value);
                  setClubFound(null);
                }}
                onBlur={() => void lookUpClub()}
                autoCapitalize="none"
                autoComplete="off"
                mono
                error={errors.clubSlug}
              />
              {clubFound ? (
                <p role="status" className={styles.muted}>
                  {`${clubFound.name} found. A request will be sent after you create the team.`}
                </p>
              ) : null}
            </>
          ) : null}
          <FormMessage error={error} />
          <Button size="lg" loading={busy} onClick={() => void createTheTeam()}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'invite' ? (
        <Card className={styles.stack}>
          <p className={styles.muted}>
            Share the team code. Parents send a request; you approve each one.
          </p>
          <ShareCard
            label="Team code"
            value={joinCode}
            shareMessage={`Join ${teamName} on Athleit with the team code ${joinCode}.`}
          />
          {link ? (
            <ShareCard
              label="Invite link"
              value={link}
              shareMessage={`Join ${teamName} on Athleit: ${link}`}
              qr
            />
          ) : (
            <div className={styles.stack}>
              <Button variant="secondary" loading={busy} onClick={() => void makeLink()}>
                Create an invite link
              </Button>
              <p className={styles.muted}>
                Anyone with the link joins as a parent right away, so share it only with your
                families. The code always waits for your approval.
              </p>
            </div>
          )}
          <p className={styles.muted}>Parents only see the team after you approve them.</p>
          <FormMessage error={error} />
          <Button size="lg" onClick={() => setStep('event')}>
            Continue
          </Button>
        </Card>
      ) : null}

      {step === 'event' ? (
        <Card className={styles.stack}>
          <p className={styles.muted}>Optional. Families see it as soon as they join.</p>
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
                onChange={(e) => setTitle(e.target.value)}
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
              <TextField label="Place" value={place} onChange={(e) => setPlace(e.target.value)} />
              <Button size="lg" loading={busy} onClick={() => void addEvent()}>
                Add event
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setAddingEvent(true)}>
              New event
            </Button>
          )}
          <Button variant="secondary" onClick={() => setStep('done')}>
            Do this later
          </Button>
          <Button variant="ghost" onClick={() => setStep('invite')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card className={styles.stack} data-testid="coach-done">
          <h2 style={{ margin: 0 }}>{`${teamName} is ready`}</h2>
          <p className={styles.muted}>Three things left. They’re on your Home.</p>
          <ul className={styles.kids}>
            <li className={styles.kid}>Invite families: share your link or code</li>
            <li className={styles.kid}>Add your schedule: practices and games</li>
            <li className={styles.kid}>Build your roster: approve requests, then add players</li>
          </ul>
          <Button size="lg" onClick={() => router.replace('/')}>
            Go to Home
          </Button>
        </Card>
      ) : null}
    </>
  );
}

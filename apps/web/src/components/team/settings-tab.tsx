'use client';

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
import type { IconName } from '@athleit/ui-core';
import { useState, type FormEvent, type ReactNode } from 'react';

import { formText } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import { Badge, Button, Card, Icon, Select, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { SubscriptionSummary } from '@/components/billing/subscription-summary';

import { ConfirmSheet, ListState } from './parts';
import { HeaderAction } from './team-hub';
import styles from './team.module.css';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Settings: team name, sport and season, plus club affiliation. Admins edit; everyone else reads. */
export function SettingsTab() {
  const { team, caps, reload } = useTeam();
  const client = getClient();
  const toast = useToast();
  const admin = caps.has('team.edit');
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = createTeamSchema.safeParse({
      name: formText(fd, 'name'),
      sport: formText(fd, 'sport'),
      seasonLabel: formText(fd, 'seasonLabel'),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setSaving(true);
    const res = await updateTeam(client, team.id, {
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
    <div className={styles.stack}>
      {admin ? (
        <HeaderAction>
          <Button type="submit" form="team-settings-form" loading={saving}>
            <Icon name="check" size="sm" /> Save changes
          </Button>
        </HeaderAction>
      ) : null}
      <Card>
        {admin ? (
          <form
            id="team-settings-form"
            onSubmit={onSave}
            noValidate
            className={styles.stack}
            key={team.updated_at}
          >
            <h2 className={styles.section}>Team details</h2>
            <TextField name="name" label="Team name" defaultValue={team.name} error={errors.name} />
            <Select name="sport" label="Sport" options={SPORT_OPTIONS} defaultValue={team.sport} />
            <TextField
              name="seasonLabel"
              label="Season"
              defaultValue={team.season_label}
              error={errors.seasonLabel}
            />
            <FormMessage error={error} />
          </form>
        ) : (
          <dl className={styles.stack}>
            <h2 className={styles.section}>Team details</h2>
            <Fact label="Team name" value={team.name} />
            <Fact label="Sport" value={cap(team.sport)} />
            <Fact label="Season" value={team.season_label} />
          </dl>
        )}
      </Card>
      <SubscriptionSummary teamId={team.id} />
      <ClubAffiliation />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={styles.muted}>{label}</dt>
      <dd style={{ margin: 0 }}>
        <strong>{value}</strong>
      </dd>
    </div>
  );
}

type Link = 'none' | 'pending' | 'linked' | 'declined';

function ClubAffiliation() {
  const { team, caps, reload } = useTeam();
  const client = getClient();
  const admin = caps.has('team.requestClubLink');
  const links = useLoad(
    () => getLinkRequests(client, { teamId: team.id }),
    [team.id, team.club_id],
  );
  const club = useLoad(
    () =>
      team.club_id ? getClub(client, team.club_id) : Promise.resolve({ data: null, error: null }),
    [team.club_id],
  );
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);

  // Newest request decides the state: pending waits, declined can be sent again.
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

  const badge: Record<
    Link,
    { icon: IconName; label: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }
  > = {
    none: { icon: 'minus-circle', label: 'Not linked', tone: 'neutral' },
    pending: { icon: 'hourglass', label: 'Pending', tone: 'warning' },
    linked: { icon: 'link', label: 'Linked', tone: 'success' },
    declined: { icon: 'x-circle', label: 'Declined', tone: 'danger' },
  };

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const found = await findClub(client, slug);
    const target = found.data?.[0];
    if (found.error || !target) {
      setBusy(false);
      return setError(found.error ? friendlyError(found.error) : 'No club has that web address.');
    }
    const res = await requestClubLink(client, team.id, target.id);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSlug('');
    links.reload();
  }
  async function onLeave() {
    setBusy(true);
    const res = await unlinkTeamFromClub(client, team.id);
    setBusy(false);
    setLeave(false);
    if (res.error) return setError(friendlyError(res.error));
    reload();
    links.reload();
  }

  const form: ReactNode = (
    <form onSubmit={onRequest} noValidate className={styles.stack}>
      <TextField
        label="Club web address"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        autoCapitalize="none"
        placeholder="e.g. riverside-youth-soccer"
        mono
      />
      <FormMessage error={error} />
      <Button
        type="submit"
        variant={state === 'declined' ? 'secondary' : 'primary'}
        loading={busy}
        disabled={!slug.trim()}
      >
        {state === 'declined' ? 'Request again' : 'Request link'}
      </Button>
    </form>
  );

  return (
    <Card className={styles.stack}>
      <div className={`${styles.row} ${styles.between}`}>
        <h2 className={styles.section}>Club affiliation</h2>
        <Badge tone={badge[state].tone}>
          <Icon name={badge[state].icon} size="sm" weight="fill" /> {badge[state].label}
        </Badge>
      </div>
      <ListState
        name="club affiliation"
        loading={links.loading}
        error={links.error}
        onRetry={links.reload}
      >
        {state === 'linked' ? (
          <>
            <strong>{clubName}</strong>
            <p className={styles.muted}>Club admins can see your roster but can’t edit the team.</p>
            {admin ? (
              <div>
                <Button variant="secondary" onClick={() => setLeave(true)}>
                  <Icon name="sign-out" size="sm" /> Leave club
                </Button>
              </div>
            ) : null}
            <FormMessage error={error} />
          </>
        ) : state === 'pending' ? (
          <p className={styles.muted}>Waiting for {clubName} to approve.</p>
        ) : !admin ? (
          <p className={styles.muted}>This team isn’t linked to a club.</p>
        ) : (
          <>
            {state === 'declined' ? (
              <p className={styles.muted}>
                The club declined this request. You can send a new one.
              </p>
            ) : (
              <p className={styles.muted}>
                Teams can exist on their own. To affiliate with a club, ask it: its admin approves
                the link.
              </p>
            )}
            {form}
          </>
        )}
      </ListState>
      <ConfirmSheet
        open={leave}
        title="Leave this club?"
        body="Club admins will no longer see your roster. You can ask to join again later."
        confirmLabel="Leave club"
        busy={busy}
        onConfirm={() => void onLeave()}
        onClose={() => setLeave(false)}
      />
    </Card>
  );
}

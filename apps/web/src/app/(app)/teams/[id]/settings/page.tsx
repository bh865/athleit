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
  getLinkRequests,
  requestClubLink,
  rotateJoinCode,
  unlinkTeamFromClub,
  updateTeam,
} from '@athleit/db/api';
import { useState, type FormEvent } from 'react';

import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage, LoadState } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import { Badge, Button, Card, Select, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

export default function SettingsPage() {
  const { team, caps, reload } = useTeam();
  const client = getClient();
  const admin = caps.has('team.edit');
  const links = useLoad(
    () =>
      admin
        ? getLinkRequests(client, { teamId: team.id })
        : Promise.resolve({ data: [], error: null }),
    [team.id, team.club_id],
  );
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState(team.join_code);
  const [linkSlug, setLinkSlug] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);

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
    const res = await updateTeam(client, team.id, {
      name: parsed.data.name,
      sport: parsed.data.sport,
      season_label: parsed.data.seasonLabel,
    });
    if (res.error) return setError(friendlyError(res.error));
    setSaved(true);
    reload();
  }

  async function onRotate() {
    const res = await rotateJoinCode(client, team.id);
    if (res.error) return setError(friendlyError(res.error));
    setCode(res.data);
  }

  async function onRequestLink(e: FormEvent) {
    e.preventDefault();
    setLinkError(null);
    setLinkNote(null);
    const found = await findClub(client, linkSlug);
    if (found.error) return setLinkError(friendlyError(found.error));
    const club = found.data[0];
    if (!club) return setLinkError('No club has that web address.');
    const res = await requestClubLink(client, team.id, club.id);
    if (res.error) return setLinkError(friendlyError(res.error));
    setLinkNote(`Request sent to ${club.name}. The club’s admin has to approve it.`);
    setLinkSlug('');
    links.reload();
  }

  async function onUnlink() {
    const res = await unlinkTeamFromClub(client, team.id);
    if (res.error) return setLinkError(friendlyError(res.error));
    reload();
    links.reload();
  }

  return (
    <>
      {caps.has('team.rotateCode') && (
        <Card className={styles.stack}>
          <h2 className={styles.section}>Team code</h2>
          <p className={styles.muted}>
            Families enter this code to ask to join. A code never grants access by itself; you
            approve each request.
          </p>
          <p className={`${styles.mono} ${styles.code}`} data-testid="join-code">
            {code}
          </p>
          <div>
            <Button variant="secondary" onClick={() => void onRotate()}>
              Generate a new code
            </Button>
          </div>
        </Card>
      )}

      {admin && (
        <Card>
          <form onSubmit={onSave} noValidate className={styles.stack} key={team.updated_at}>
            <h2 className={styles.section}>Team details</h2>
            <TextField name="name" label="Team name" defaultValue={team.name} error={errors.name} />
            <Select name="sport" label="Sport" options={SPORT_OPTIONS} defaultValue={team.sport} />
            <TextField
              name="seasonLabel"
              label="Season"
              defaultValue={team.season_label}
              error={errors.seasonLabel}
            />
            <FormMessage error={error} success={saved ? 'Saved.' : null} />
            <div>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
      )}

      {admin && (
        <Card className={styles.stack}>
          <h2 className={styles.section}>Club</h2>
          {team.club_id ? (
            <>
              <p>
                This team is part of a club. Club admins can see your roster but can’t edit the
                team.
              </p>
              <div>
                <Button variant="secondary" onClick={() => void onUnlink()}>
                  Leave the club
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={onRequestLink} className={styles.stack} noValidate>
              <p className={styles.muted}>
                Teams can exist on their own. To affiliate with a club, ask it: its admin approves
                the link.
              </p>
              <TextField
                label="Club web address"
                value={linkSlug}
                onChange={(e) => setLinkSlug(e.target.value)}
                autoCapitalize="none"
                mono
              />
              <FormMessage error={linkError} success={linkNote} />
              <div>
                <Button type="submit" variant="secondary" disabled={!linkSlug.trim()}>
                  Ask to join this club
                </Button>
              </div>
            </form>
          )}
          <LoadState
            loading={links.loading}
            error={links.error}
            empty={false}
            onRetry={links.reload}
          >
            {(links.data?.length ?? 0) > 0 && (
              <ul className={styles.list}>
                {links.data?.map((l) => (
                  <li key={l.id} className={styles.item}>
                    <span className={styles.grow}>{l.club_name}</span>
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
                  </li>
                ))}
              </ul>
            )}
          </LoadState>
        </Card>
      )}

      {!admin && <p className={styles.notice}>Only team admins can change settings.</p>}
    </>
  );
}

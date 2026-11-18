'use client';

import {
  ageOn,
  canHaveOwnLogin,
  fieldErrors,
  friendlyError,
  updateChildSchema,
  type FieldErrors,
} from '@athleit/core';
import { getChild, getPhotoUrl, setChildPhoto, updateChild } from '@athleit/db/api';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage, LoadState } from '@/components/app/states';
import { todayIso } from '@athleit/ui-core';

import { Badge, Button, Card, DatePicker, PageHeader, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

export default function ChildPage() {
  const { id } = useParams<{ id: string }>();
  const client = getClient();
  const child = useLoad(() => getChild(client, id), [id]);
  const [errors, setErrors] = useState<
    FieldErrors<'firstName' | 'lastName' | 'dateOfBirth' | 'loginInviteEmail'>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [claimLink, setClaimLink] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = formText(fd, 'loginInviteEmail').trim();
    const dob = formText(fd, 'dateOfBirth');
    const parsed = updateChildSchema.safeParse({
      firstName: formText(fd, 'firstName'),
      lastName: formText(fd, 'lastName'),
      dateOfBirth: dob,
      loginInviteEmail: email && canHaveOwnLogin(dob) ? email : null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await updateChild(client, id, parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setSaved(true);
    if (parsed.data.loginInviteEmail) setClaimLink(`${window.location.origin}/claim/${id}`);
    child.reload();
  }

  const photoPath = child.data?.photo_path ?? null;
  const photo = useLoad(
    () =>
      photoPath ? getPhotoUrl(client, photoPath) : Promise.resolve({ data: null, error: null }),
    [photoPath],
  );
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file || !child.data) return;
    setPhotoError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return setPhotoError('Choose a JPEG, PNG or WebP image.');
    if (file.size > 5 * 1024 * 1024) return setPhotoError('Choose an image under 5 MB.');
    const res = await setChildPhoto(client, {
      playerId: child.data.id,
      body: file,
      contentType: file.type,
      previousPath: child.data.photo_path,
    });
    if (res.error) return setPhotoError(friendlyError(res.error));
    child.reload();
  }

  const c = child.data;
  const ownLoginAllowed = c ? canHaveOwnLogin(c.date_of_birth) : false;

  return (
    <>
      <PageHeader
        title={c ? `${c.first_name} ${c.last_name}` : 'Child'}
        subtitle={c ? `${ageOn(c.date_of_birth)} years old` : undefined}
        back={{ href: '/family', label: 'Family' }}
      />
      <LoadState loading={child.loading} error={child.error} onRetry={child.reload}>
        {c && (
          <>
            <Card className={styles.row}>
              {photo.data ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.data} alt={`${c.first_name}’s photo`} className={styles.photo} />
              ) : null}
              <div className={`${styles.stack} ${styles.tight}`}>
                <label className={`${styles.link} ${styles.clickable}`}>
                  {c.photo_path ? 'Change photo' : 'Add a photo (optional)'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    data-testid="photo-input"
                    className={styles.visuallyHidden}
                    onChange={(e) => void onPhoto(e.target.files?.[0])}
                  />
                </label>
                <p className={styles.muted}>
                  Only you and staff of {c.first_name}’s teams can see it.
                </p>
                <FormMessage error={photoError} />
              </div>
            </Card>

            <Card>
              <form
                onSubmit={onSubmit}
                noValidate
                className={styles.stack}
                key={c.id + c.date_of_birth}
              >
                <TextField
                  name="firstName"
                  label="First name"
                  defaultValue={c.first_name}
                  error={errors.firstName}
                />
                <TextField
                  name="lastName"
                  label="Last name"
                  defaultValue={c.last_name}
                  error={errors.lastName}
                />
                <DatePicker
                  name="dateOfBirth"
                  label="Date of birth"
                  defaultValue={c.date_of_birth}
                  max={todayIso()}
                  yearSpan={{ before: 25, after: 0 }}
                  error={errors.dateOfBirth}
                />
                {ownLoginAllowed ? (
                  <TextField
                    name="loginInviteEmail"
                    type="email"
                    label="Their own login email (optional)"
                    hint="Aged 13 or older, they can sign in themselves. If they sign up with this email, their login links to this profile automatically."
                    defaultValue={c.login_invite_email ?? ''}
                    error={errors.loginInviteEmail}
                  />
                ) : (
                  <p className={styles.notice}>
                    Children under 13 have no login. You manage {c.first_name}’s profile and teams.
                  </p>
                )}
                <FormMessage error={error} success={saved ? 'Saved.' : null} />
                <Button type="submit" loading={busy}>
                  Save changes
                </Button>
              </form>
              {claimLink && (
                <p className={styles.notice} style={{ marginTop: 'var(--space-4)' }}>
                  Send {c.first_name} this link to sign in:{' '}
                  <span className={styles.mono}>{claimLink}</span>
                </p>
              )}
            </Card>

            {c.profile_id && <Badge tone="success">Has their own login</Badge>}

            <section className={styles.stack} aria-labelledby="teams-h">
              <h2 className={styles.section} id="teams-h">
                Teams
              </h2>
              {c.team_players.length === 0 ? (
                <p className={styles.notice}>{c.first_name} isn’t on a team yet.</p>
              ) : (
                <ul className={styles.list}>
                  {c.team_players.map((tp) => (
                    <li key={tp.id} className={styles.item}>
                      <div className={styles.grow}>
                        <strong>{tp.teams?.name ?? 'Team'}</strong>
                        <p className={styles.muted}>
                          {tp.teams?.season_label}
                          {tp.jersey_number != null ? ` · #${tp.jersey_number}` : ''}
                          {tp.position ? ` · ${tp.position}` : ''}
                        </p>
                      </div>
                      <Badge tone={tp.status === 'active' ? 'success' : 'neutral'}>
                        {tp.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/join?player=${c.id}`} className={styles.link}>
                Join a team with a code for {c.first_name}
              </Link>
            </section>
          </>
        )}
      </LoadState>
    </>
  );
}

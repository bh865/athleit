'use client';

import {
  accountNameSchema,
  AVATAR_MAX_BYTES,
  friendlyError,
  validateAvatarFile,
} from '@athleit/core';
import { removeMyAvatar, setMyAvatar, updateMyProfile } from '@athleit/db/api';
import { useId, useRef, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Avatar, Badge, Button, Card, Sheet, Text, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './account.module.css';
import { authError } from './auth-error';
import { PhotoCropSheet } from './photo-crop-sheet';

type Photo =
  | { state: 'idle' }
  | { state: 'uploading'; name: string; size: number }
  | { state: 'failed'; message: string; blob?: Blob };

export function ProfileSection() {
  const { userId, displayName, email, avatarUrl, avatarValue, updateProfile } = useApp();
  const toast = useToast();
  const client = getClient();
  const name = displayName ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;

  async function saveName() {
    if (!userId || draft === null) return;
    const parsed = accountNameSchema.safeParse({ displayName: draft });
    if (!parsed.success) return setNameError(parsed.error.issues[0]?.message);
    setSaving(true);
    const r = await updateMyProfile(client, userId, { display_name: parsed.data.displayName });
    setSaving(false);
    if (r.error) return setNameError(friendlyError(r.error));
    updateProfile({ displayName: parsed.data.displayName });
    setDraft(null);
    setNameError(undefined);
    toast('Display name saved');
  }

  // Photo ---------------------------------------------------------------------------------------
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Photo>({ state: 'idle' });
  const [cropping, setCropping] = useState<File | null>(null);
  const [over, setOver] = useState(false);

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) return setPhoto({ state: 'failed', message: problem });
    setPhoto({ state: 'idle' });
    setCropping(file);
  }
  async function upload(blob: Blob) {
    if (!userId) return;
    setCropping(null);
    if (blob.size > AVATAR_MAX_BYTES)
      return setPhoto({ state: 'failed', message: 'That photo is too large after cropping.' });
    setPhoto({ state: 'uploading', name: 'profile.jpg', size: blob.size });
    const r = await setMyAvatar(client, {
      userId,
      body: blob,
      contentType: 'image/jpeg',
      previous: avatarValue,
    });
    if (r.error) return setPhoto({ state: 'failed', message: friendlyError(r.error), blob });
    updateProfile({ avatarValue: r.data });
    setPhoto({ state: 'idle' });
    toast('Photo updated');
  }
  async function removePhoto() {
    if (!userId) return;
    const r = await removeMyAvatar(client, { userId, previous: avatarValue });
    if (r.error) return toast(friendlyError(r.error), 'danger');
    updateProfile({ avatarValue: null });
    toast('Photo removed');
  }

  // Email ---------------------------------------------------------------------------------------
  const [emailOpen, setEmailOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  return (
    <section id="profile" className={styles.section} aria-labelledby="profile-h">
      <div className={styles.sectionHead}>
        <Text variant="heading" as="h2" id="profile-h">
          Profile
        </Text>
      </div>

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Display name
        </Text>
        <Text muted as="p">
          How your name appears across Athleit.
        </Text>
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <TextField
            label="Display name"
            value={editing ? draft : name}
            maxLength={80}
            autoComplete="name"
            error={nameError}
            hint={`${(editing ? draft : name).length} / 80 · Shown to coaches, teammates and families.`}
            onChange={(e) => {
              setDraft(e.target.value);
              setNameError(undefined);
            }}
          />
          {editing ? (
            <div className={styles.actions}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setDraft(null);
                  setNameError(undefined);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Photo
        </Text>
        <Text muted as="p">
          Shown on your profile and next to your messages.
        </Text>
        {photo.state === 'uploading' ? (
          <div className={styles.stack} role="status">
            <div className={styles.row}>
              <Avatar name={name} src={avatarUrl} size="lg" />
              <div className={styles.rowText}>
                <Text variant="bodyBold">Uploading photo…</Text>
                <Text variant="caption" muted>
                  {photo.name} · {(photo.size / 1024 / 1024).toFixed(1)} MB
                </Text>
              </div>
            </div>
            <div className={styles.bar} aria-hidden>
              <div className={styles.barFill} />
            </div>
          </div>
        ) : photo.state === 'failed' ? (
          <div className={styles.stack}>
            <div className={styles.row}>
              <Avatar name={name} src={avatarUrl} size="lg" />
              <div className={styles.rowText} role="alert">
                <Text variant="bodyBold">Upload failed</Text>
                <Text variant="caption" muted>
                  {photo.message}
                </Text>
              </div>
            </div>
            <div className={styles.actions}>
              {photo.blob ? (
                <Button variant="secondary" onClick={() => void upload(photo.blob!)}>
                  Try again
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                Choose another
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={styles.drop}
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files[0]);
            }}
          >
            <Avatar name={name} src={avatarUrl} size="lg" />
            <Text variant="bodyBold">Drag a photo here</Text>
            <Text variant="caption" muted>
              JPG, PNG or WebP · up to 5 MB · cropped to a circle
            </Text>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                Choose file
              </Button>
              {avatarValue ? (
                <Button variant="ghost" onClick={() => void removePhoto()}>
                  Remove photo
                </Button>
              ) : null}
            </div>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          data-testid="avatar-file"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Card>
      <PhotoCropSheet
        file={cropping}
        onCancel={() => setCropping(null)}
        onDone={(b) => void upload(b)}
      />

      <Card className={styles.card}>
        <Text variant="bodyBold" as="h3">
          Email
        </Text>
        <Text muted as="p">
          Used to sign in and for receipts.
        </Text>
        <div className={styles.row}>
          <Text className={`${styles.rowText} ${styles.truncate}`}>{email}</Text>
          <Badge tone="success">Verified</Badge>
          <Button variant="secondary" onClick={() => setEmailOpen(true)}>
            Change email
          </Button>
        </div>
        {pending ? (
          <div className={styles.notice} role="status">
            <Text variant="bodyBold">Check your inbox to confirm</Text>
            <Text variant="caption" muted as="p">
              We sent a link to {pending}. Your email stays {email} until you confirm.
            </Text>
            <div className={styles.actions}>
              <Button
                variant="ghost"
                onClick={async () => {
                  const { error } = await client.auth.resend({
                    type: 'email_change',
                    email: pending,
                  });
                  toast(
                    error ? authError(error) : 'Confirmation resent',
                    error ? 'danger' : 'success',
                  );
                }}
              >
                Resend email
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel change
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      <ChangeEmailSheet
        open={emailOpen}
        current={email ?? ''}
        onClose={() => setEmailOpen(false)}
        onSent={(to) => {
          setPending(to);
          setEmailOpen(false);
        }}
      />
    </section>
  );
}

function ChangeEmailSheet({
  open,
  current,
  onClose,
  onSent,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const id = useId();
  async function send() {
    const v = value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setError('Enter a valid email address.');
    if (v === current.toLowerCase()) return setError('That is already your email.');
    setBusy(true);
    const { error: e } = await getClient().auth.updateUser({ email: v });
    setBusy(false);
    if (e) return setError(authError(e));
    setValue('');
    setError(undefined);
    onSent(v);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Change email" placement="right">
      <form
        className={styles.stack}
        aria-labelledby={id}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Text variant="heading" as="h2" id={id}>
          Change email
        </Text>
        <TextField
          label="New email"
          type="email"
          autoComplete="email"
          value={value}
          error={error}
          hint={`Current: ${current}`}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
        <Text variant="caption" muted as="p">
          We’ll send a confirmation link to the new address. Your email won’t change until you
          confirm.
        </Text>
        <div className={styles.actions}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Send confirmation
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

import {
  accountNameSchema,
  authErrorMessage,
  AVATAR_MAX_BYTES,
  friendlyError,
  validateAvatarFile,
} from '@athleit/core';
import { removeMyAvatar, setMyAvatar, updateMyProfile } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ListGroup,
  ListRow,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

export default function AccountProfileScreen() {
  useScreenTitle('Profile');
  const { userId, displayName, email, avatarUrl, avatarValue, updateProfile } = useApp();
  const toast = useToast();
  const name = displayName ?? '';
  const [nameOpen, setNameOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [pending, setPending] = useState<string | null>(null);

  async function saveName() {
    if (!userId) return;
    const parsed = accountNameSchema.safeParse({ displayName: draft });
    if (!parsed.success) return setNameError(parsed.error.issues[0]?.message);
    setSaving(true);
    const r = await updateMyProfile(supabase, userId, { display_name: parsed.data.displayName });
    setSaving(false);
    if (r.error) return setNameError(friendlyError(r.error));
    updateProfile({ displayName: parsed.data.displayName });
    setNameOpen(false);
    toast('Display name saved');
  }

  async function pick(source: 'camera' | 'library') {
    setPhotoError(null);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setPhotoError('Allow camera access in Settings to take a photo.');
    }
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset || !userId) return;
    const contentType = asset.mimeType ?? 'image/jpeg';
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const problem = validateAvatarFile({ type: contentType, size: body.byteLength });
    if (problem || body.byteLength > AVATAR_MAX_BYTES)
      return setPhotoError(problem ?? 'Too large.');
    setUploading(true);
    const r = await setMyAvatar(supabase, {
      userId,
      body,
      contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
      previous: avatarValue,
    });
    setUploading(false);
    if (r.error) return setPhotoError(friendlyError(r.error));
    updateProfile({ avatarValue: r.data });
    setPhotoOpen(false);
    toast('Photo updated');
  }
  async function removePhoto() {
    if (!userId) return;
    const r = await removeMyAvatar(supabase, { userId, previous: avatarValue });
    if (r.error) return setPhotoError(friendlyError(r.error));
    updateProfile({ avatarValue: null });
    setPhotoOpen(false);
    toast('Photo removed');
  }
  async function sendEmail() {
    const v = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return setEmailError('Enter a valid email address.');
    if (v === (email ?? '').toLowerCase()) return setEmailError('That is already your email.');
    const { error } = await supabase.auth.updateUser({ email: v });
    if (error) return setEmailError(authErrorMessage(error));
    setPending(v);
    setNewEmail('');
    setEmailOpen(false);
  }

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        <H1>Profile</H1>
        <ListGroup>
          <ListRow
            title="Photo"
            subtitle="Shown on your profile and next to your messages."
            leading={<Avatar name={name} src={avatarUrl} size="lg" />}
            onPress={() => {
              setPhotoError(null);
              setPhotoOpen(true);
            }}
            testID="row-photo"
          />
          <ListRow
            title="Display name"
            subtitle={name}
            onPress={() => {
              setDraft(name);
              setNameError(undefined);
              setNameOpen(true);
            }}
            testID="row-name"
          />
          <ListRow
            title="Email"
            subtitle={email ?? ''}
            trailing={<Badge tone="success">Verified</Badge>}
            onPress={() => setEmailOpen(true)}
            last
            testID="row-email"
          />
        </ListGroup>
        {pending ? (
          <Card style={{ gap: space[2] }}>
            <Text variant="bodyBold">Check your inbox to confirm</Text>
            <Text variant="caption" muted>
              We sent a link to {pending}. Your email stays {email} until you confirm.
            </Text>
            <Button title="Cancel change" variant="ghost" onPress={() => setPending(null)} />
          </Card>
        ) : null}
      </View>

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Edit name">
        <Text variant="heading">Edit name</Text>
        <TextField
          label="Display name"
          value={draft}
          maxLength={80}
          autoComplete="name"
          error={nameError}
          hint={`${draft.length} / 80 · Shown to coaches, teammates and families.`}
          onChangeText={(v) => {
            setDraft(v);
            setNameError(undefined);
          }}
        />
        <Button title="Save" loading={saving} onPress={() => void saveName()} testID="save-name" />
        <Button title="Cancel" variant="ghost" onPress={() => setNameOpen(false)} />
      </Sheet>

      <Sheet open={photoOpen} onClose={() => setPhotoOpen(false)} title="Profile photo">
        <Text variant="heading">Profile photo</Text>
        {uploading ? <Text muted>Uploading photo…</Text> : null}
        {photoError ? <Notice tone="error">{photoError}</Notice> : null}
        <Button
          title="Take photo"
          icon="camera"
          variant="secondary"
          disabled={uploading}
          onPress={() => void pick('camera')}
        />
        <Button
          title="Choose from library"
          variant="secondary"
          disabled={uploading}
          onPress={() => void pick('library')}
        />
        {avatarValue ? (
          <Button
            title="Remove photo"
            variant="ghost"
            disabled={uploading}
            onPress={() => void removePhoto()}
          />
        ) : null}
        <Text variant="caption" muted>
          JPG, PNG or WebP · up to 5 MB
        </Text>
      </Sheet>

      <Sheet open={emailOpen} onClose={() => setEmailOpen(false)} title="Change email">
        <Text variant="heading">Change email</Text>
        <TextField
          label="New email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={newEmail}
          error={emailError}
          hint={`Current: ${email ?? ''}`}
          onChangeText={(v) => {
            setNewEmail(v);
            setEmailError(undefined);
          }}
        />
        <Text variant="caption" muted>
          We’ll send a confirmation link to the new address. Your email won’t change until you
          confirm.
        </Text>
        <Button title="Send confirmation" onPress={() => void sendEmail()} />
        <Button title="Cancel" variant="ghost" onPress={() => setEmailOpen(false)} />
      </Sheet>
    </AppScreen>
  );
}

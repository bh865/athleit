import { loadContextSource } from '@athleit/db/api';
import {
  createSupportRequest,
  finalizeSupportAttachments,
  supportErrorCode,
  type SupportType,
} from '@athleit/db/support';
import { space } from '@athleit/tokens';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H2, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { useApp } from '@/lib/app-provider';
import { Button, ListGroup, ListRow, SegmentedControl, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';

const BUCKET = 'support-attachments';
const MAX_FILES = 3; // Placeholder: support.max_attachments
const MAX_BYTES = 10 * 1024 * 1024; // Placeholder: support.max_attachment_mb
const TYPES = [
  { value: 'question', label: 'Question' },
  { value: 'problem', label: 'Wrong' },
  { value: 'billing', label: 'Billing' },
  { value: 'feedback', label: 'Idea' },
] as const satisfies readonly { value: SupportType; label: string }[];
const HELPER: Record<SupportType, string> = {
  question: 'Ask anything about using Athleit.',
  problem: 'Tell us what you expected and what happened instead.',
  billing: 'Tell us which payment or subscription this is about.',
  feedback: 'We read every idea; we can’t reply to all.',
};
const SAFETY =
  'If a child is in danger, call your local emergency number. To report a message or a person in Athleit, use Report in the conversation.';
const PRIVACY = 'Please don’t include children’s birthdates, medical details or card numbers.';

interface Pick {
  uri: string;
  name: string;
  type: string;
  size: number;
}

export default function ContactScreen() {
  useScreenTitle('Contact support');
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ q?: string; article?: string }>();
  const { userId, email } = useApp();
  const [type, setType] = useState<SupportType>('question');
  const [subject, setSubject] = useState(params.q ?? '');
  const [body, setBody] = useState('');
  const [place, setPlace] = useState<{ kind: 't' | 'c'; id: string; name: string } | null>(null);
  const [places, setPlaces] = useState<{ kind: 't' | 'c'; id: string; name: string }[]>([]);
  const [showPlaces, setShowPlaces] = useState(false);
  const [files, setFiles] = useState<Pick[]>([]);
  const [diag, setDiag] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadContextSource(supabase, userId).then((r) => {
      if (r.error) return;
      setPlaces([
        ...r.data.teams.map((t) => ({ kind: 't' as const, id: t.team_id, name: t.name })),
        ...r.data.clubs.map((c) => ({ kind: 'c' as const, id: c.club_id, name: c.name })),
      ]);
    });
  }, [userId]);

  async function addImage() {
    setFormError(null);
    if (files.length >= MAX_FILES) return setFormError(`You can attach up to ${MAX_FILES} images.`);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const size = a.fileSize ?? 0;
    if (size > MAX_BYTES) return setFormError('That image is larger than 10 MB.');
    setFiles([
      ...files,
      {
        uri: a.uri,
        name: a.fileName ?? `photo-${files.length + 1}.jpg`,
        type: a.mimeType ?? 'image/jpeg',
        size,
      },
    ]);
  }

  async function send() {
    setFormError(null);
    const e: typeof errors = {};
    if (!subject.trim()) e.subject = 'Add a short subject.';
    if (!body.trim()) e.body = 'Tell us what happened.';
    setErrors(e);
    if (e.subject || e.body) return;
    setBusy(true);
    const diagnostics: Record<string, string> = diag
      ? {
          app_version: String(Constants.expoConfig?.version ?? 'dev'),
          platform: Platform.OS,
          os: `${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
          route: pathname,
          at: new Date().toISOString(),
        }
      : {};
    const r = await createSupportRequest(supabase, {
      type,
      subject: subject.trim(),
      body: body.trim(),
      teamId: place?.kind === 't' ? place.id : null,
      clubId: place?.kind === 'c' ? place.id : null,
      sourceArticle: params.article ?? null,
      sourceRoute: pathname,
      diagnostics,
    });
    if (r.error) {
      setBusy(false);
      const code = supportErrorCode(r.error);
      return setFormError(
        code === 'rate_limited'
          ? 'You’ve sent a few requests already. Please wait a bit before sending another.'
          : 'We couldn’t send that. Check your connection. Your text is still here, so you can try again.',
      );
    }
    const sent: { path: string; name: string }[] = [];
    for (const f of files) {
      const path = `${r.data.id}/${uuid()}/${f.name.replace(/[^\w.\- ]+/g, '_')}`;
      const bytes = await (await fetch(f.uri)).arrayBuffer();
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.type });
      if (!up.error) sent.push({ path, name: f.name });
    }
    if (sent.length) await finalizeSupportAttachments(supabase, r.data.id, sent);
    setBusy(false);
    setDone(r.data.ref);
  }

  if (done)
    return (
      <AppScreen>
        <View style={{ gap: space[3] }}>
          <H2>We got your request</H2>
          <Text>
            Your reference is <Text variant="mono">{done}</Text>.
          </Text>
          <Text muted>
            A person reads every request and replies by email. We can’t promise a time.
          </Text>
          <Button
            title="View your request"
            onPress={() => router.replace(`/help/requests/${done}` as never)}
          />
          <Button
            title="Back to Help"
            variant="ghost"
            onPress={() => router.replace('/help' as never)}
          />
        </View>
      </AppScreen>
    );

  return (
    <AppScreen>
      <View style={{ gap: space[4] }}>
        {type === 'problem' ? <Notice>{SAFETY}</Notice> : null}
        <SegmentedControl
          label="What is this about?"
          value={type}
          options={TYPES}
          onChange={setType}
        />
        <Text muted>{HELPER[type]}</Text>
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <TextField
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          maxLength={120}
          error={errors.subject}
        />
        <TextField
          label={type === 'feedback' ? 'Details' : 'What happened?'}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          maxLength={5000}
          error={errors.body}
        />
        <TextField
          label="Reply email"
          value={email ?? ''}
          editable={false}
          hint="We’ll reply in the app and to this email."
        />
        {places.length ? (
          <>
            <Button
              title={place ? `About: ${place.name}` : 'Which team or club? (optional)'}
              variant="secondary"
              onPress={() => setShowPlaces(!showPlaces)}
            />
            {showPlaces ? (
              <ListGroup>
                {[{ kind: 't' as const, id: '', name: 'Not about a team' }, ...places].map(
                  (p, i, arr) => (
                    <ListRow
                      key={`${p.kind}${p.id}`}
                      title={p.name}
                      last={i === arr.length - 1}
                      onPress={() => {
                        setPlace(p.id ? p : null);
                        setShowPlaces(false);
                      }}
                    />
                  ),
                )}
              </ListGroup>
            ) : null}
          </>
        ) : null}
        <View style={{ gap: space[2] }}>
          <Text variant="bodyBold">
            Images ({files.length} of {MAX_FILES})
          </Text>
          {files.map((f, i) => (
            <ListRow
              key={f.uri}
              title={f.name}
              trailing={
                <Button
                  title="Remove"
                  variant="ghost"
                  onPress={() => setFiles(files.filter((_, k) => k !== i))}
                />
              }
              last
            />
          ))}
          <Button
            title="Add an image"
            variant="secondary"
            icon="image"
            onPress={() => void addImage()}
          />
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text>Include diagnostics</Text>
          <Switch value={diag} onValueChange={setDiag} accessibilityLabel="Include diagnostics" />
        </View>
        <Text variant="caption" muted>
          What we include: app version, phone type and system version, the screen you came from and
          the time. Never message text or payment details.
        </Text>
        <Text variant="caption" muted>
          {PRIVACY}
        </Text>
        <Button title="Send request" loading={busy} onPress={() => void send()} />
      </View>
    </AppScreen>
  );
}

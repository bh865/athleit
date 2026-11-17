import { createThreadSchema, friendlyError, type ThreadType } from '@athleit/core';
import { createThread, getMessageablePeople } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { H1, Notice } from '@/components/app/kit';
import { Button, Card, Chip, EmptyState, SegmentedControl, Text, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** New-message flow. The database enforces the safety rules; this explains them in plain words. */
export function NewMessage() {
  const { active } = useApp();
  const router = useRouter();
  const teamId = active?.kind === 'team' ? active.id : null;
  const isStaff = active?.kind === 'team' && ['admin', 'coach', 'manager'].includes(active.role);
  const people = useLoad(
    () =>
      teamId ? getMessageablePeople(supabase, teamId) : Promise.resolve({ data: [], error: null }),
    [teamId],
  );
  const [type, setType] = useState<ThreadType>('direct');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!teamId)
    return (
      <EmptyState icon="chat-circle" title="Messages are per team" body="Switch to a team first." />
    );
  const options = [
    { value: 'direct' as const, label: 'Direct' },
    ...(isStaff
      ? [
          { value: 'group' as const, label: 'Group' },
          { value: 'announcement' as const, label: 'Announcement' },
        ]
      : []),
  ];
  const list = people.data ?? [];
  const pickedMinor = list.some((p) => picked.includes(p.profile_id) && p.is_minor);
  const toggle = (id: string) =>
    setPicked((cur) =>
      type === 'direct'
        ? cur.includes(id)
          ? []
          : [id]
        : cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id],
    );

  async function submit() {
    setError(null);
    const parsed = createThreadSchema.safeParse({
      team_id: teamId,
      type,
      title: title || null,
      participant_ids: type === 'announcement' ? [] : picked,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the details.');
    setBusy(true);
    const res = await createThread(supabase, {
      teamId: teamId!,
      type,
      title: parsed.data.title ?? null,
      participantIds: parsed.data.participant_ids,
    });
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else router.replace(`/messages/${res.data}` as never);
  }

  return (
    <Card style={{ gap: space[4] }}>
      <H1>New message</H1>
      {options.length > 1 ? (
        <SegmentedControl
          label="Type"
          value={type}
          options={options}
          onChange={(v) => {
            setType(v);
            setPicked([]);
            setError(null);
          }}
        />
      ) : null}
      {type !== 'direct' ? (
        <TextField
          label={type === 'announcement' ? 'Announcement title' : 'Group name'}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
      ) : null}
      {type === 'announcement' ? (
        <Text muted>
          Everyone on the team will see this. Only coaches and managers can post in it.
        </Text>
      ) : people.loading ? (
        <Text muted>Loading…</Text>
      ) : list.length === 0 ? (
        <Text muted>No one to message yet.</Text>
      ) : (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
        >
          {list.map((p) => (
            <Chip
              key={p.profile_id}
              label={`${p.display_name ?? 'Member'} · ${p.role}`}
              selected={picked.includes(p.profile_id)}
              onPress={() => toggle(p.profile_id)}
            />
          ))}
        </View>
      )}
      {pickedMinor && type === 'direct' ? (
        <Notice>
          Players under 18 can only be messaged one-to-one by their own parent or guardian. To reach
          a player’s family, message their parent.
        </Notice>
      ) : null}
      {pickedMinor && type === 'group' ? (
        <Notice>
          A group with a player under 18 needs two coaches or managers, or a coach and that player’s
          parent.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title={type === 'announcement' ? 'Create announcement' : 'Start conversation'}
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

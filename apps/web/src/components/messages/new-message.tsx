'use client';

import { createThreadSchema, friendlyError, type ThreadType } from '@athleit/core';
import { createThread, getMessageablePeople } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { LoadState } from '@/components/app/states';
import { Button, Card, Chip, EmptyState, SegmentedControl, Text, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

/**
 * New-message flow. The database enforces the safety rules; this screen explains them in plain
 * language before sending and shows the database's answer if it still says no.
 */
export function NewMessage() {
  const { active } = useApp();
  const router = useRouter();
  const teamId = active?.kind === 'team' ? active.id : null;
  const isStaff = active?.kind === 'team' && ['admin', 'coach', 'manager'].includes(active.role);
  const people = useLoad(
    () =>
      teamId
        ? getMessageablePeople(getClient(), teamId)
        : Promise.resolve({ data: [], error: null }),
    [teamId],
  );
  const [type, setType] = useState<ThreadType>('direct');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!teamId) {
    return (
      <EmptyState icon="chat-circle" title="Messages are per team" body="Switch to a team first." />
    );
  }
  const options: { value: ThreadType; label: string }[] = [
    { value: 'direct', label: 'Direct' },
    ...(isStaff
      ? ([
          { value: 'group', label: 'Group' },
          { value: 'announcement', label: 'Announcement' },
        ] as const)
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
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details.');
      return;
    }
    setBusy(true);
    const res = await createThread(getClient(), {
      teamId: teamId!,
      type,
      title: parsed.data.title ?? null,
      participantIds: parsed.data.participant_ids,
    });
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else router.push(`/messages/${res.data}`);
  }

  return (
    <Card>
      <Text variant="heading" as="h2">
        New message
      </Text>
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
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />
      ) : null}
      {type === 'announcement' ? (
        <Text muted as="p">
          Everyone on the team will see this. Only coaches and managers can post in it.
        </Text>
      ) : (
        <LoadState
          loading={people.loading}
          error={people.error}
          empty={list.length === 0}
          emptyText="No one to message yet."
          onRetry={people.reload}
        >
          <div
            role="group"
            aria-label="Who to message"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
          >
            {list.map((p) => (
              <Chip
                key={p.profile_id}
                selected={picked.includes(p.profile_id)}
                onClick={() => toggle(p.profile_id)}
              >
                {p.display_name ?? 'Member'} · {p.role}
              </Chip>
            ))}
          </div>
        </LoadState>
      )}
      {pickedMinor && type === 'direct' ? (
        <Text muted as="p">
          Players under 18 can only be messaged one-to-one by their own parent or guardian. To reach
          a player’s family, message their parent.
        </Text>
      ) : null}
      {pickedMinor && type === 'group' ? (
        <Text muted as="p">
          A group with a player under 18 needs two coaches or managers, or a coach and that player’s
          parent.
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" as="p">
          {error}
        </Text>
      ) : null}
      <Button loading={busy} onClick={() => void submit()}>
        {type === 'announcement' ? 'Create announcement' : 'Start conversation'}
      </Button>
    </Card>
  );
}

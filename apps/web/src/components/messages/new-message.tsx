'use client';

import {
  composeReasonText,
  createThreadSchema,
  friendlyError,
  groupComposePeople,
  inboxRowFromDb,
  isTeamStaff,
  messagingTeams,
  minorGroupCheck,
  MINOR_GROUP_RULE_TEXT,
  type ComposePerson,
} from '@athleit/core';
import { createThread, getComposePeople, getInbox, sendMessage } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { FormMessage, LoadState } from '@/components/app/states';
import { Avatar, Button, Card, Chip, EmptyState, Icon, Text, TextArea, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './new-message.module.css';

type Step = 'pick' | 'group' | 'announcement';

/**
 * Search-and-tap compose, grouped by team. A direct message opens at once (an existing thread
 * shows "Open"); staff also get New group and New announcement. The database enforces the safety
 * rules; this explains them in plain words first. `/messages/new` stays the deep link.
 */
export function NewMessage() {
  const { contexts } = useApp();
  const router = useRouter();
  const teams = messagingTeams(contexts);
  const staffTeams = teams.filter((t) => isTeamStaff(contexts, t.id));

  const load = useLoad(async () => {
    const [inbox, ...per] = await Promise.all([
      getInbox(getClient(), { limit: 100 }),
      ...teams.map((t) => getComposePeople(getClient(), t.id)),
    ]);
    const failed = [inbox, ...per].find((r) => r.error);
    if (failed?.error) return { data: null, error: failed.error };
    return {
      data: {
        rows: (inbox.data ?? []).map(inboxRowFromDb),
        people: teams.map((t, i) => ({
          teamId: t.id,
          teamName: t.title,
          people: (per[i]?.data ?? []).map<ComposePerson>((p) => ({
            profileId: p.profile_id,
            displayName: p.display_name ?? 'Member',
            role: p.role,
            isMinor: p.is_minor,
            canDirect: p.can_direct,
            reason: p.reason,
          })),
        })),
      },
      error: null,
    };
  }, [teams.map((t) => t.id).join(',')]);

  const [step, setStep] = useState<Step>('pick');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(staffTeams[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [first, setFirst] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const groups = useMemo(
    () => (load.data ? groupComposePeople(load.data.people, load.data.rows, query) : []),
    [load.data, query],
  );
  const teamPeople = load.data?.people.find((t) => t.teamId === teamId)?.people ?? [];
  const selected = teamPeople.filter((p) => picked.includes(p.profileId));
  const minor = minorGroupCheck(selected);

  if (teams.length === 0) {
    return (
      <EmptyState
        icon="chat-circle"
        title="Messages live inside each team"
        body="Join a team to start a conversation."
      />
    );
  }

  async function startDirect(team: string, profileId: string) {
    setError(null);
    setBusy(true);
    const res = await createThread(getClient(), { teamId: team, type: 'direct', participantIds: [profileId] });
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else router.replace(`/messages/${res.data}`);
  }

  async function submit() {
    setError(null);
    if (!teamId) return;
    const parsed = createThreadSchema.safeParse({
      team_id: teamId,
      type: step === 'group' ? 'group' : 'announcement',
      title,
      participant_ids: step === 'group' ? picked : [],
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the details.');
    if (step === 'announcement' && !first.trim()) return setError('Write the first message.');
    setBusy(true);
    const res = await createThread(getClient(), {
      teamId,
      type: step === 'group' ? 'group' : 'announcement',
      title: parsed.data.title ?? null,
      participantIds: parsed.data.participant_ids,
    });
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    if (step === 'announcement') {
      const sent = await sendMessage(getClient(), { threadId: res.data as string, body: first.trim() });
      if (sent.error) setError(friendlyError(sent.error));
    }
    setBusy(false);
    router.replace(`/messages/${res.data}`);
  }

  if (step !== 'pick') {
    return (
      <Card className={styles.card}>
        <Button variant="ghost" onClick={() => { setStep('pick'); setError(null); }}>
          <Icon name="caret-left" size="sm" /> Back to people
        </Button>
        <Text variant="heading" as="h2">
          {step === 'group' ? 'New group' : 'New announcement'}
        </Text>
        {staffTeams.length > 1 ? (
          <div role="group" aria-label="Team" className={styles.chips}>
            {staffTeams.map((t) => (
              <Chip key={t.id} selected={teamId === t.id} onClick={() => { setTeamId(t.id); setPicked([]); }}>
                {t.title}
              </Chip>
            ))}
          </div>
        ) : null}
        <TextField
          label={step === 'group' ? 'Group name' : 'Announcement title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />
        {step === 'announcement' ? (
          <>
            <TextArea label="First message" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={4000} />
            <Text muted as="p">Everyone on the team will see this. Only coaches and managers can post in it.</Text>
          </>
        ) : (
          <>
            {selected.length ? (
              <div className={styles.chips} aria-label="Selected people">
                {selected.map((p) => (
                  <Chip key={p.profileId} selected onClick={() => setPicked((cur) => cur.filter((x) => x !== p.profileId))}>
                    {p.displayName} ✕
                  </Chip>
                ))}
              </div>
            ) : null}
            <ul className={styles.people} aria-label="People">
              {teamPeople.map((p) => {
                const on = picked.includes(p.profileId);
                return (
                  <li key={p.profileId}>
                    <button
                      type="button"
                      className={styles.person}
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => setPicked((cur) => (on ? cur.filter((x) => x !== p.profileId) : [...cur, p.profileId]))}
                    >
                      <Avatar name={p.displayName} />
                      <span className={styles.grow}>{p.displayName}</span>
                      <Text variant="caption" muted>{p.role}</Text>
                      <Icon name={on ? 'check-circle' : 'circle-dashed'} weight={on ? 'fill' : 'regular'} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {minor.hasMinor ? <Text as="p" role={minor.ok ? undefined : 'alert'} muted={minor.ok}>{MINOR_GROUP_RULE_TEXT}</Text> : null}
          </>
        )}
        <FormMessage error={error} />
        <Button
          loading={busy}
          disabled={!teamId || !title.trim() || (step === 'group' && (picked.length === 0 || !minor.ok))}
          onClick={() => void submit()}
        >
          {step === 'group' ? 'Create group' : 'Post announcement'}
        </Button>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <Text variant="heading" as="h2">
        New message
      </Text>
      <label className={styles.search}>
        <Icon name="magnifying-glass" size="sm" />
        <input
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {staffTeams.length > 0 ? (
        <div className={styles.actions}>
          <button type="button" onClick={() => setStep('group')}>
            <Icon name="users-three" /> New group
          </button>
          <button type="button" onClick={() => setStep('announcement')}>
            <Icon name="megaphone" /> New announcement
          </button>
        </div>
      ) : null}
      <FormMessage error={error} />
      <LoadState
        loading={load.loading && !load.data}
        error={load.error}
        empty={groups.length === 0}
        emptyText={query ? 'No one matches that search.' : 'No one to message yet.'}
        onRetry={load.reload}
      >
        {groups.map((g) => (
          <section key={g.teamId} aria-label={g.teamName}>
            {teams.length > 1 ? (
              <Text variant="label" muted as="h3">
                {g.teamName}
              </Text>
            ) : null}
            <ul className={styles.people}>
              {g.people.map((p) => (
                <li key={p.profileId}>
                  <button
                    type="button"
                    className={styles.person}
                    disabled={!p.canDirect || busy}
                    onClick={() =>
                      p.existingThreadId
                        ? router.replace(`/messages/${p.existingThreadId}`)
                        : void startDirect(g.teamId, p.profileId)
                    }
                  >
                    <Avatar name={p.displayName} />
                    <span className={styles.grow}>
                      <span className={styles.name}>{p.displayName}</span>
                      <Text variant="caption" muted as="span">
                        {p.canDirect ? p.role : composeReasonText(p.reason)}
                      </Text>
                    </span>
                    {p.existingThreadId && p.canDirect ? <Text variant="caption" muted>Open</Text> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </LoadState>
    </Card>
  );
}

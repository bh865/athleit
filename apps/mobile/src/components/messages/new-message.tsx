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
import { createThread, getComposePeople, getInboxAll, sendMessage } from '@athleit/db/api';
import { componentTokens, radius, space, textStyles } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { H1, Notice } from '@/components/app/kit';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Text,
  TextField,
  useTheme,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { fontFace } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Step = 'pick' | 'group' | 'announcement';

/**
 * Search-and-tap compose, grouped by team. Direct messages open at once (an existing thread shows
 * "Open"); staff also get New group and New announcement. The database enforces the safety rules;
 * this explains them in plain words before they are hit.
 */
export function NewMessage() {
  const { contexts } = useApp();
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.color;
  const teams = messagingTeams(contexts);
  const staffTeams = teams.filter((t) => isTeamStaff(contexts, t.id));

  const load = useLoad(async () => {
    const [inbox, ...per] = await Promise.all([
      getInboxAll(supabase),
      ...teams.map((t) => getComposePeople(supabase, t.id)),
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

  async function startDirect(team: string, profileId: string) {
    setError(null);
    setBusy(true);
    const res = await createThread(supabase, {
      teamId: team,
      type: 'direct',
      participantIds: [profileId],
    });
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else router.replace(`/messages/${res.data}` as never);
  }

  const teamPeople = (load.data?.people.find((t) => t.teamId === teamId)?.people ?? []).filter(
    Boolean,
  );
  const selected = teamPeople.filter((p) => picked.includes(p.profileId));
  const minor = minorGroupCheck(selected);

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
    const res = await createThread(supabase, {
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
      const sent = await sendMessage(supabase, {
        threadId: res.data as string,
        body: first.trim(),
      });
      if (sent.error) setError(friendlyError(sent.error));
    }
    setBusy(false);
    router.replace(`/messages/${res.data}` as never);
  }

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to people"
      onPress={() => {
        setStep('pick');
        setError(null);
      }}
      style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
    >
      <Text variant="bodyBold">‹ Back</Text>
    </Pressable>
  );

  if (teams.length === 0)
    return (
      <EmptyState
        icon="chat-circle"
        title="Messages live inside each team"
        body="Join a team to start a conversation."
      />
    );

  if (step !== 'pick') {
    const label = step === 'group' ? 'New group' : 'New announcement';
    return (
      <View style={{ gap: space[4] }}>
        {back}
        <H1>{label}</H1>
        {staffTeams.length > 1 ? (
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
            accessibilityRole="radiogroup"
          >
            {staffTeams.map((t) => (
              <Chip
                key={t.id}
                label={t.title}
                accessibilityRole="radio"
                selected={teamId === t.id}
                onPress={() => {
                  setTeamId(t.id);
                  setPicked([]);
                }}
              />
            ))}
          </View>
        ) : null}
        <TextField
          label={step === 'group' ? 'Group name' : 'Announcement title'}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
        {step === 'announcement' ? (
          <>
            <TextField
              label="First message"
              value={first}
              onChangeText={setFirst}
              multiline
              maxLength={4000}
            />
            <Text muted>
              Everyone on the team will see this. Only coaches and managers can post in it.
            </Text>
          </>
        ) : (
          <>
            {selected.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {selected.map((p) => (
                  <Chip
                    key={p.profileId}
                    label={`${p.displayName} ✕`}
                    selected
                    onPress={() => setPicked((cur) => cur.filter((x) => x !== p.profileId))}
                  />
                ))}
              </View>
            ) : null}
            {teamPeople.map((p) => {
              const on = picked.includes(p.profileId);
              return (
                <Pressable
                  key={p.profileId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() =>
                    setPicked((cur) =>
                      on ? cur.filter((x) => x !== p.profileId) : [...cur, p.profileId],
                    )
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space[3],
                    minHeight: componentTokens.minTarget,
                  }}
                >
                  <Avatar name={p.displayName} />
                  <Text style={{ flex: 1 }}>{p.displayName}</Text>
                  <Text variant="caption" muted>
                    {p.role}
                  </Text>
                  <Icon
                    name={on ? 'check-circle' : 'circle-dashed'}
                    weight={on ? 'fill' : 'regular'}
                  />
                </Pressable>
              );
            })}
            {minor.hasMinor ? (
              <Notice tone={minor.ok ? 'neutral' : 'error'}>{MINOR_GROUP_RULE_TEXT}</Notice>
            ) : null}
          </>
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          title={step === 'group' ? 'Create group' : 'Post announcement'}
          loading={busy}
          disabled={
            !teamId || !title.trim() || (step === 'group' && (picked.length === 0 || !minor.ok))
          }
          onPress={() => void submit()}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space[4] }}>
      <H1>New message</H1>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: componentTokens.minTarget,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          backgroundColor: c.surfaceAlt,
        }}
      >
        <Icon name="magnifying-glass" color={c.muted} />
        <TextInput
          accessibilityLabel="Search people"
          placeholder="Search people"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={{
            flex: 1,
            minHeight: componentTokens.minTarget,
            color: c.ink,
            fontFamily: fontFace.sans.semibold,
            fontSize: textStyles.body.size,
          }}
        />
      </View>
      {staffTeams.length > 0 ? (
        <View style={{ gap: space[1] }}>
          {[
            { label: 'New group', icon: 'users-three' as const, to: 'group' as const },
            { label: 'New announcement', icon: 'megaphone' as const, to: 'announcement' as const },
          ].map((a) => (
            <Pressable
              key={a.to}
              accessibilityRole="button"
              onPress={() => setStep(a.to)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: componentTokens.minTarget,
              }}
            >
              <Icon name={a.icon} />
              <Text variant="bodyBold">{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {load.loading && !load.data ? (
        <LoadingSkeleton rows={4} />
      ) : load.error ? (
        <ErrorState message="Can’t load people" onRetry={load.reload} />
      ) : groups.length === 0 ? (
        <Text muted>{query ? 'No one matches that search.' : 'No one to message yet.'}</Text>
      ) : (
        groups.map((g) => (
          <View key={g.teamId} style={{ gap: space[1] }}>
            {teams.length > 1 ? (
              <Text variant="label" muted accessibilityRole="header">
                {g.teamName}
              </Text>
            ) : null}
            {g.people.map((p) => (
              <Pressable
                key={p.profileId}
                accessibilityRole="button"
                accessibilityState={{ disabled: !p.canDirect || busy }}
                accessibilityLabel={`${p.displayName}, ${p.role}${p.canDirect ? (p.existingThreadId ? ', open conversation' : '') : `, unavailable. ${composeReasonText(p.reason) ?? ''}`}`}
                disabled={!p.canDirect || busy}
                onPress={() =>
                  p.existingThreadId
                    ? router.replace(`/messages/${p.existingThreadId}` as never)
                    : void startDirect(g.teamId, p.profileId)
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  minHeight: componentTokens.minTarget + space[2],
                  opacity: p.canDirect ? 1 : 0.6,
                }}
              >
                <Avatar name={p.displayName} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{p.displayName}</Text>
                  <Text variant="caption" muted>
                    {p.canDirect ? p.role : composeReasonText(p.reason)}
                  </Text>
                </View>
                {p.existingThreadId && p.canDirect ? (
                  <Text variant="caption" muted>
                    Open
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

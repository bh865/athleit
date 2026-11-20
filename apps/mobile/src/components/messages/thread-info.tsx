import {
  friendlyError,
  getAttachmentKind,
  isIndefiniteMute,
  isMuted,
  isTeamStaff,
  memberCountLabel,
  minorGroupCheck,
  MINOR_GROUP_RULE_TEXT,
  MUTE_DURATIONS,
  muteDurationLabel,
  muteStatusLabel,
  muteUntil,
  type ComposePerson,
} from '@athleit/core';
import {
  addParticipant,
  getAttachmentUrl,
  getComposePeople,
  getMyParticipation,
  getThread,
  getThreadMedia,
  getThreadMembers,
  removeParticipant,
  setThreadArchived,
  setThreadArchivedForMe,
  setThreadMute,
  setThreadPinned,
} from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, Switch, TextInput, View } from 'react-native';

import { H1, Notice } from '@/components/app/kit';
import {
  Avatar,
  Card,
  ErrorState,
  Icon,
  LoadingSkeleton,
  SegmentedControl,
  Sheet,
  Text,
  useTheme,
  useToast,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { fontFace } from '@/lib/fonts';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { textStyles } from '@athleit/tokens';

/** Conversation info: mute, members, shared media and files, archive for me, pin, and staff tools. */
export function ThreadInfo({ threadId }: { threadId: string }) {
  const { userId, contexts } = useApp();
  const me = userId ?? '';
  const router = useRouter();
  const toast = useToast();
  const { theme } = useTheme();
  const c = theme.color;

  const thread = useLoad(() => getThread(supabase, threadId), [threadId]);
  const mine = useLoad(() => getMyParticipation(supabase, threadId, me), [threadId, me]);
  const members = useLoad(() => getThreadMembers(supabase, threadId), [threadId]);
  const media = useLoad(() => getThreadMedia(supabase, threadId), [threadId]);

  const [muteOpen, setMuteOpen] = useState(false);
  const [tab, setTab] = useState<'media' | 'files'>('media');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = thread.data;
  const isAnnouncement = t?.type === 'announcement';
  const isGroup = t?.type === 'group';
  const isStaff = t ? isTeamStaff(contexts, t.team_id) : false;
  const teamRoles = contexts.find((x) => x.kind === 'team' && x.id === t?.team_id)?.roles ?? [];
  const canManage = isStaff && (isAnnouncement || teamRoles.includes('admin') || t?.created_by === me);
  const muted = isMuted(mine.data?.muted_until ?? null);

  const run = async (fn: () => PromiseLike<{ error: unknown }>, done?: string) => {
    setError(null);
    const r = await fn();
    if (r.error) {
      const msg = friendlyError(r.error as never);
      setError(msg);
      toast(msg, 'danger');
    } else if (done) toast(done);
    mine.reload();
    thread.reload();
    members.reload();
  };

  const list = (members.data ?? []).filter((m) => (m.display_name ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  const files = (media.data ?? []).filter((m) => (tab === 'media' ? m.mime_type.startsWith('image/') : m.mime_type === 'application/pdf'));

  if (thread.loading && !t) return <LoadingSkeleton rows={5} />;
  if (thread.error || !t) return <ErrorState message="Can’t load this conversation" onRetry={thread.reload} />;
  const other = !isGroup && !isAnnouncement ? list.find((m) => m.profile_id !== me)?.display_name : null;
  const title = t.title ?? other ?? 'Conversation';

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <Avatar name={title} size="lg" />
        <H1>{title}</H1>
        <Text muted>
          {isAnnouncement ? 'Announcements for the whole team' : memberCountLabel(members.data?.length ?? 0)}
        </Text>
      </View>

      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}>
          <Icon name="bell-slash" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">Mute notifications</Text>
            {muted ? (
              <Text variant="caption" muted>
                {muteStatusLabel(mine.data?.muted_until ?? null)}
              </Text>
            ) : null}
          </View>
          <Switch
            accessibilityLabel="Mute notifications"
            value={muted}
            onValueChange={(on) => (on ? setMuteOpen(true) : void run(() => setThreadMute(supabase, threadId, null), 'Unmuted'))}
          />
        </View>
        <Text variant="caption" muted>
          Notifications never include message text for conversations with a player under 18.
        </Text>
      </Card>

      <Card style={{ gap: space[1] }}>
        {[
          { label: mine.data?.pinned_at ? 'Unpin' : 'Pin to top', icon: 'push-pin' as const, run: () => run(() => setThreadPinned(supabase, threadId, !mine.data?.pinned_at)) },
          {
            label: mine.data?.archived_at && mine.data.archived_at >= t.last_message_at ? 'Move back to inbox' : 'Archive for me',
            icon: 'archive-box' as const,
            run: () =>
              run(
                () => setThreadArchivedForMe(supabase, threadId, !(mine.data?.archived_at && mine.data.archived_at >= t.last_message_at)),
                'Done. A new message brings it back.',
              ),
          },
        ].map((a) => (
          <Pressable key={a.label} accessibilityRole="button" onPress={() => void a.run()} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}>
            <Icon name={a.icon} />
            <Text variant="bodyBold">{a.label}</Text>
          </Pressable>
        ))}
        <Text variant="caption" muted>
          Archiving only hides it for you until the next message.
        </Text>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {!isAnnouncement ? (
        <View style={{ gap: space[2] }}>
          <Text variant="heading" accessibilityRole="header">
            Members
          </Text>
          {isGroup && (members.data?.length ?? 0) > 6 ? (
            <TextInput
              accessibilityLabel="Search members"
              placeholder="Search members"
              placeholderTextColor={c.muted}
              value={q}
              onChangeText={setQ}
              style={{ minHeight: componentTokens.minTarget, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: c.surfaceAlt, color: c.ink, fontFamily: fontFace.sans.semibold, fontSize: textStyles.body.size }}
            />
          ) : null}
          {list.map((m) => (
            <View key={m.profile_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}>
              <Avatar name={m.display_name ?? 'Member'} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{m.display_name ?? 'Member'}</Text>
                <Text variant="caption" muted>
                  {m.role === 'owner' ? 'Owner' : m.role === 'read_only' ? 'Read only' : ''}
                </Text>
              </View>
              {isGroup && canManage && m.profile_id !== me ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.display_name ?? 'member'}`}
                  onPress={() => void run(() => removeParticipant(supabase, threadId, m.profile_id), 'Removed')}
                  style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
                >
                  <Icon name="user-minus" color={c.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {isGroup && canManage ? (
            <Pressable accessibilityRole="button" onPress={() => setAddOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}>
              <Icon name="user-plus" />
              <Text variant="bodyBold">Add people</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text muted>Everyone on the team sees this thread. Only coaches and managers can post.</Text>
      )}

      <View style={{ gap: space[2] }}>
        <SegmentedControl
          label="Shared"
          value={tab}
          options={[
            { value: 'media' as const, label: 'Media' },
            { value: 'files' as const, label: 'Files' },
          ]}
          onChange={setTab}
        />
        {media.loading && !media.data ? (
          <LoadingSkeleton rows={2} />
        ) : files.length === 0 ? (
          <Text muted>{tab === 'media' ? 'No photos shared yet.' : 'No files shared yet.'}</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {files.map((m) => (
              <MediaTile key={m.storage_path} path={m.storage_path} name={m.original_name} mime={m.mime_type} />
            ))}
          </View>
        )}
      </View>

      {canManage ? (
        <Card style={{ gap: space[2] }}>
          <Text variant="heading" accessibilityRole="header">
            Staff
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void run(() => setThreadArchived(supabase, threadId, !t.archived_at), t.archived_at ? 'Unarchived' : 'Archived for everyone')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}
          >
            <Icon name="archive-box" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{t.archived_at ? 'Unarchive for everyone' : 'Archive for everyone'}</Text>
              <Text variant="caption" muted>
                {t.archived_at ? 'People can reply again.' : 'Closes the conversation so no one can reply.'}
              </Text>
            </View>
          </Pressable>
        </Card>
      ) : null}

      <Sheet open={muteOpen} onClose={() => setMuteOpen(false)} title="Mute notifications">
        <View style={{ gap: space[2] }}>
          {MUTE_DURATIONS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              onPress={() => {
                setMuteOpen(false);
                void run(() => setThreadMute(supabase, threadId, muteUntil(d)), isIndefiniteMute(muteUntil(d)) ? 'Muted' : muteDurationLabel(d));
              }}
              style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
            >
              <Text variant="bodyBold">{muteDurationLabel(d)}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {isGroup && canManage ? (
        <AddPeople
          open={addOpen}
          onClose={() => setAddOpen(false)}
          teamId={t.team_id}
          existing={(members.data ?? []).map((m) => m.profile_id)}
          onAdd={(id) => run(() => addParticipant(supabase, threadId, id), 'Added')}
        />
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Back to conversation" onPress={() => router.back()} style={{ minHeight: componentTokens.minTarget, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="bodyBold">Back to conversation</Text>
      </Pressable>
    </View>
  );
}

function MediaTile({ path, name, mime }: { path: string; name: string; mime: string }) {
  const { theme } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getAttachmentUrl(supabase, path).then((r) => live && setUrl(r.data ?? null));
    return () => {
      live = false;
    };
  }, [path]);
  const size = componentTokens.avatar.lg * 2;
  const pdf = getAttachmentKind(mime) === 'pdf';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pdf ? `Open ${name}` : `Photo ${name}`}
      onPress={() => url && void Linking.openURL(url)}
      style={{ width: size, height: size, borderRadius: radius.md, overflow: 'hidden', backgroundColor: theme.color.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
    >
      {pdf || !url ? (
        <View style={{ alignItems: 'center', gap: space[1], padding: space[2] }}>
          <Icon name={pdf ? 'file-pdf' : 'image'} />
          <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center' }}>
            {name}
          </Text>
        </View>
      ) : (
        <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      )}
    </Pressable>
  );
}

function AddPeople({
  open,
  onClose,
  teamId,
  existing,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  existing: string[];
  onAdd: (id: string) => void;
}) {
  const people = useLoad(() => (open ? getComposePeople(supabase, teamId) : Promise.resolve({ data: [], error: null })), [open, teamId]);
  const options = useMemo(() => (people.data ?? []).filter((p) => !existing.includes(p.profile_id)), [people.data, existing]);
  const asPerson = (p: (typeof options)[number]): ComposePerson => ({ profileId: p.profile_id, displayName: p.display_name ?? 'Member', role: p.role, isMinor: p.is_minor, canDirect: p.can_direct, reason: p.reason });
  return (
    <Sheet open={open} onClose={onClose} title="Add people">
      <View style={{ gap: space[2] }}>
        <Text variant="caption" muted>
          {MINOR_GROUP_RULE_TEXT}
        </Text>
        {options.length === 0 ? <Text muted>Everyone you can add is already here.</Text> : null}
        {options.map((p) => {
          const person = asPerson(p);
          return (
            <Pressable
              key={p.profile_id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${person.displayName}${minorGroupCheck([person]).hasMinor ? ', player under 18' : ''}`}
              onPress={() => {
                onAdd(p.profile_id);
                onClose();
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: componentTokens.minTarget }}
            >
              <Avatar name={person.displayName} />
              <Text style={{ flex: 1 }}>{person.displayName}</Text>
              <Text variant="caption" muted>{person.role}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

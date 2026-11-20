'use client';

import {
  friendlyError,
  getAttachmentKind,
  isMuted,
  isTeamStaff,
  memberCountLabel,
  MINOR_GROUP_RULE_TEXT,
  MUTE_DURATIONS,
  muteDurationLabel,
  muteStatusLabel,
  muteUntil,
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
import { useEffect, useRef, useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { Avatar, Icon, LoadingSkeleton, SegmentedControl, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './thread-info-panel.module.css';

/** Conversation info: mute durations, pin, archive for me, members, shared media and files, staff tools. */
export function ThreadInfoPanel({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { userId, contexts } = useApp();
  const me = userId ?? '';
  const toast = useToast();
  const client = getClient();
  const thread = useLoad(() => getThread(client, threadId), [threadId]);
  const mine = useLoad(() => getMyParticipation(client, threadId, me), [threadId, me]);
  const members = useLoad(() => getThreadMembers(client, threadId), [threadId]);
  const media = useLoad(() => getThreadMedia(client, threadId), [threadId]);
  const [tab, setTab] = useState<'media' | 'files'>('media');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc closes; focus moves in on open (the opener restores it when the panel unmounts).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = thread.data;
  const isAnnouncement = t?.type === 'announcement';
  const isGroup = t?.type === 'group';
  const isStaff = t ? isTeamStaff(contexts, t.team_id) : false;
  const roles = contexts.find((c) => c.kind === 'team' && c.id === t?.team_id)?.roles ?? [];
  const canManage = isStaff && (isAnnouncement || roles.includes('admin') || t?.created_by === me);
  const muted = isMuted(mine.data?.muted_until ?? null);
  const archivedForMe = Boolean(
    t && mine.data?.archived_at && mine.data.archived_at >= t.last_message_at,
  );

  const run = async (fn: () => PromiseLike<{ error: unknown }>, done?: string) => {
    const r = await fn();
    if (r.error) toast(friendlyError(r.error as never), 'danger');
    else if (done) toast(done);
    mine.reload();
    thread.reload();
    members.reload();
  };

  const list = (members.data ?? []).filter((m) =>
    (m.display_name ?? '').toLowerCase().includes(q.trim().toLowerCase()),
  );
  const files = (media.data ?? []).filter((m) =>
    tab === 'media' ? m.mime_type.startsWith('image/') : m.mime_type === 'application/pdf',
  );

  return (
    <aside className={styles.panel} aria-label="Conversation info">
      <div className={styles.head}>
        <Text variant="heading" as="h2">
          Info
        </Text>
        <button
          ref={closeRef}
          type="button"
          className={styles.iconBtn}
          aria-label="Close info"
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </div>
      {!t ? (
        <LoadingSkeleton />
      ) : (
        <>
          <section className={styles.block}>
            <label className={styles.row}>
              <span>
                <Text variant="bodyBold">Mute notifications</Text>
                {muted ? (
                  <Text variant="caption" muted as="p">
                    {muteStatusLabel(mine.data?.muted_until ?? null)}
                  </Text>
                ) : null}
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={muted || choosing}
                aria-label="Mute notifications"
                onChange={(e) => {
                  // Turning it on asks for a duration; turning it off unmutes at once.
                  if (e.target.checked) setChoosing(true);
                  else {
                    setChoosing(false);
                    if (muted) void run(() => setThreadMute(client, threadId, null), 'Unmuted');
                  }
                }}
              />
            </label>
            {choosing ? (
              <div className={styles.durations} role="group" aria-label="Mute for">
                {MUTE_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setChoosing(false);
                      void run(() => setThreadMute(client, threadId, muteUntil(d)));
                    }}
                  >
                    {muteDurationLabel(d)}
                  </button>
                ))}
              </div>
            ) : null}
            <Text variant="caption" muted as="p">
              Notifications never include message text for conversations with a player under 18.
            </Text>
          </section>

          <section className={styles.block}>
            <button
              type="button"
              className={styles.action}
              onClick={() =>
                void run(() => setThreadPinned(client, threadId, !mine.data?.pinned_at))
              }
            >
              <Icon name="push-pin" /> {mine.data?.pinned_at ? 'Unpin' : 'Pin to top'}
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() =>
                void run(
                  () => setThreadArchivedForMe(client, threadId, !archivedForMe),
                  'Done. A new message brings it back.',
                )
              }
            >
              <Icon name="archive-box" /> {archivedForMe ? 'Move back to inbox' : 'Archive for me'}
            </button>
            <Text variant="caption" muted as="p">
              Archiving only hides it for you until the next message.
            </Text>
          </section>

          <section className={styles.block} aria-label="Members">
            <Text variant="label" muted as="h3">
              {isAnnouncement
                ? 'Audience'
                : `Members · ${memberCountLabel(members.data?.length ?? 0)}`}
            </Text>
            {isAnnouncement ? (
              <Text muted as="p">
                Everyone on the team sees this thread. Only coaches and managers can post.
              </Text>
            ) : (
              <>
                {isGroup && (members.data?.length ?? 0) > 6 ? (
                  <input
                    className={styles.search}
                    type="search"
                    placeholder="Search members"
                    aria-label="Search members"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                ) : null}
                <ul className={styles.people}>
                  {list.map((m) => (
                    <li key={m.profile_id}>
                      <Avatar name={m.display_name ?? 'Member'} />
                      <span>
                        {m.display_name ?? 'Member'}
                        {m.role === 'owner' ? <span className={styles.muted}> · Owner</span> : null}
                      </span>
                      {isGroup && canManage && m.profile_id !== me ? (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label={`Remove ${m.display_name ?? 'member'}`}
                          onClick={() =>
                            void run(
                              () => removeParticipant(client, threadId, m.profile_id),
                              'Removed',
                            )
                          }
                        >
                          <Icon name="user-minus" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {isGroup && canManage ? (
                  <>
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => setAdding((v) => !v)}
                    >
                      <Icon name="user-plus" /> Add people
                    </button>
                    {adding ? (
                      <AddPeople
                        teamId={t.team_id}
                        existing={(members.data ?? []).map((m) => m.profile_id)}
                        onAdd={(id) => {
                          setAdding(false);
                          void run(() => addParticipant(client, threadId, id), 'Added');
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className={styles.block} aria-label="Shared">
            <SegmentedControl
              label="Shared"
              value={tab}
              options={[
                { value: 'media' as const, label: 'Media' },
                { value: 'files' as const, label: 'Files' },
              ]}
              onChange={setTab}
            />
            {files.length === 0 ? (
              <Text muted as="p">
                {tab === 'media' ? 'No photos shared yet.' : 'No files shared yet.'}
              </Text>
            ) : (
              <ul className={styles.grid}>
                {files.map((m) => (
                  <li key={m.storage_path}>
                    <MediaTile path={m.storage_path} name={m.original_name} mime={m.mime_type} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canManage ? (
            <section className={styles.block} aria-label="Staff">
              <Text variant="label" muted as="h3">
                Staff
              </Text>
              <button
                type="button"
                className={styles.action}
                onClick={() =>
                  void run(
                    () => setThreadArchived(client, threadId, !t.archived_at),
                    t.archived_at ? 'Unarchived' : 'Archived for everyone',
                  )
                }
              >
                <Icon name="archive-box" />{' '}
                {t.archived_at ? 'Unarchive for everyone' : 'Archive for everyone'}
              </button>
              <Text variant="caption" muted as="p">
                {t.archived_at
                  ? 'People can reply again.'
                  : 'Closes the conversation so no one can reply.'}
              </Text>
            </section>
          ) : null}
        </>
      )}
    </aside>
  );
}

function MediaTile({ path, name, mime }: { path: string; name: string; mime: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getAttachmentUrl(getClient(), path).then((r) => live && setUrl(r.data ?? null));
    return () => {
      live = false;
    };
  }, [path]);
  const pdf = getAttachmentKind(mime) === 'pdf';
  return (
    <a
      className={styles.tile}
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-label={pdf ? `Open ${name}` : `Photo ${name}`}
    >
      {pdf || !url ? (
        <span>
          <Icon name={pdf ? 'file-pdf' : 'image'} />
          <span className={styles.tileName}>{name}</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL
        <img src={url} alt="" />
      )}
    </a>
  );
}

function AddPeople({
  teamId,
  existing,
  onAdd,
}: {
  teamId: string;
  existing: string[];
  onAdd: (id: string) => void;
}) {
  const people = useLoad(() => getComposePeople(getClient(), teamId), [teamId]);
  const options = (people.data ?? []).filter((p) => !existing.includes(p.profile_id));
  return (
    <div className={styles.add}>
      <Text variant="caption" muted as="p">
        {MINOR_GROUP_RULE_TEXT}
      </Text>
      {options.length === 0 ? (
        <Text muted as="p">
          Everyone you can add is already here.
        </Text>
      ) : null}
      <ul className={styles.people}>
        {options.map((p) => (
          <li key={p.profile_id}>
            <Avatar name={p.display_name ?? 'Member'} />
            <button type="button" className={styles.action} onClick={() => onAdd(p.profile_id)}>
              {p.display_name ?? 'Member'}
              {p.is_minor ? ' (player under 18)' : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';

import {
  RESIGN_MAX_DAYS,
  WAIVER_MAX_CHARS,
  WAIVER_TEMPLATES,
  changeSummary,
  diffWords,
  friendlyError,
  HEADING_PLACEHOLDER,
  INITIALS_LINE,
  insertBlock,
  paragraphs,
  resignDays,
  resignPreset,
  resignSentence,
  waiverIssues,
  RESIGN_PRESETS,
  type ResignPreset,
} from '@athleit/core';
import {
  createWaiver,
  getWaiver,
  getWaiverCompliance,
  publishWaiverVersion,
  saveWaiverDraft,
  type Owner,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Icon, SegmentedControl, Sheet, TextField, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './builders.module.css';
import { BuilderTopBar, SaveStatus, type SaveState } from './shell';

interface Version {
  id: string;
  version: number;
  published_at: string;
  title: string;
  body: string;
  requires_resign_after_days: number | null;
}
interface Loaded {
  title: string;
  body: string;
  days: number | null;
  versions: Version[];
  owner: Owner;
}

const PRESET_LABEL: Record<ResignPreset, string> = {
  never: 'Never',
  '6m': '6 months',
  '1y': '1 year',
  custom: 'Custom',
};
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Loads the waiver (if editing) and its context, then hands a ready snapshot to the builder. */
export function WaiverBuilder({
  waiverId,
  owner,
  returnTo,
}: {
  waiverId: string | null;
  owner: Owner;
  returnTo?: string | null;
}) {
  const res = useLoad(
    () =>
      waiverId ? getWaiver(getClient(), waiverId) : Promise.resolve({ data: null, error: null }),
    [waiverId],
  );
  if (waiverId && (res.loading || res.error || !res.data))
    return (
      <div className={styles.shell}>
        <div className={styles.stepPane}>
          <LoadState loading={res.loading} error={res.error} onRetry={res.reload}>
            {null}
          </LoadState>
        </div>
      </div>
    );
  const row = res.data;
  const initial: Loaded = {
    title: row?.title ?? '',
    body: row?.draft_body ?? '',
    days: row?.draft_requires_resign_after_days ?? null,
    versions: [...(row?.waiver_versions ?? [])].sort((a, b) => b.version - a.version) as Version[],
    owner: row ? (row.team_id ? { teamId: row.team_id } : { clubId: row.club_id ?? '' }) : owner,
  };
  return <Builder waiverId={waiverId} initial={initial} returnTo={returnTo ?? null} />;
}

type View =
  | { kind: 'edit' }
  | { kind: 'preview' }
  | { kind: 'version'; id: string }
  | { kind: 'diff'; id: string };

function Builder({
  waiverId: initialId,
  initial,
  returnTo,
}: {
  waiverId: string | null;
  initial: Loaded;
  returnTo: string | null;
}) {
  const client = getClient();
  const router = useRouter();
  const toast = useToast();
  const { owner } = initial;
  const [waiverId, setWaiverId] = useState(initialId);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [days, setDays] = useState<number | null>(initial.days);
  const [customDays, setCustomDays] = useState(initial.days ? String(initial.days) : '');
  const [preset, setPreset] = useState<ResignPreset>(resignPreset(initial.days));
  const [versions, setVersions] = useState(initial.versions);
  const [view, setView] = useState<View>({ kind: 'edit' });
  const [device, setDevice] = useState<'web' | 'mobile'>('web');
  const [save, setSave] = useState<SaveState>(initialId ? 'saved' : 'idle');
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [live, setLive] = useState<{ version: number; players: number } | null>(null);
  const [tried, setTried] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const latest = versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  const issues = waiverIssues(title, body);
  const unpublished =
    !latest ||
    latest.body !== body ||
    latest.title !== title ||
    (latest.requires_resign_after_days ?? null) !== days;
  const back = () =>
    router.push(returnTo ?? (owner.teamId ? `/teams/${owner.teamId}/waivers` : '/'));

  // Who uses it: teams that require it, registrations that include it, and how many players are affected.
  const used = useLoad(async () => {
    if (!waiverId) return { data: { teams: [], regs: [], players: 0 }, error: null };
    const ids = versions.map((v) => v.id);
    const [teams, regs, comp] = await Promise.all([
      client.from('team_required_waivers').select('team_id, teams(name)').eq('waiver_id', waiverId),
      ids.length
        ? client.from('registration_events').select('id, title').overlaps('waiver_version_ids', ids)
        : Promise.resolve({ data: [], error: null }),
      owner.teamId
        ? getWaiverCompliance(client, owner.teamId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const players = new Set(
      (comp.data ?? []).filter((r) => r.waiver_id === waiverId).map((r) => r.player_id),
    );
    return {
      data: {
        teams: (
          (teams.data ?? []) as unknown as { team_id: string; teams: { name: string } | null }[]
        ).map((t) => t.teams?.name ?? 'A team'),
        regs: (regs.data ?? []) as { id: string; title: string }[],
        players: players.size,
      },
      error: null,
    };
  }, [waiverId, versions.length]);
  const signers = useLoad(async () => {
    const ids = versions.map((v) => v.id);
    if (!ids.length) return { data: new Map<string, number>(), error: null };
    const { data, error } = await client
      .from('waiver_acceptances')
      .select('waiver_version_id')
      .in('waiver_version_id', ids);
    if (error) return { data: new Map<string, number>(), error: null };
    const m = new Map<string, number>();
    for (const r of data ?? []) m.set(r.waiver_version_id, (m.get(r.waiver_version_id) ?? 0) + 1);
    return { data: m, error: null };
  }, [versions.length, live?.version]);

  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
    setLive(null);
  };

  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!title.trim()) return null;
    setSave('saving');
    let id = waiverId;
    if (!id) {
      const c = await createWaiver(client, owner, title.trim(), body, days ?? undefined);
      if (c.error) {
        setSave('error');
        toast(friendlyError(c.error), 'danger');
        return null;
      }
      id = c.data as string;
      setWaiverId(id);
      window.history.replaceState(
        null,
        '',
        `/manage/waivers/${id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`,
      );
    } else {
      const s = await saveWaiverDraft(client, id, title.trim(), body, days ?? undefined);
      if (s.error) {
        setSave('error');
        toast(friendlyError(s.error), 'danger');
        return null;
      }
    }
    setDirty(false);
    setSave('saved');
    return id;
  }, [client, owner, title, body, days, waiverId, returnTo, toast]);

  // Autosave the draft shortly after the last edit. Published versions are never touched by this.
  useEffect(() => {
    if (!dirty || !title.trim() || body.length > WAIVER_MAX_CHARS) return;
    const t = setTimeout(() => void saveDraft(), 1500);
    return () => clearTimeout(t);
  }, [dirty, title, body, days, saveDraft]);

  async function publish() {
    setTried(true);
    if (issues.length) return setConfirm(false);
    setPublishing(true);
    const id = await saveDraft();
    if (!id) return setPublishing(false);
    const p = await publishWaiverVersion(client, id);
    if (p.error) {
      setPublishing(false);
      return toast(friendlyError(p.error), 'danger');
    }
    const fresh = await getWaiver(client, id);
    setPublishing(false);
    setConfirm(false);
    if (fresh.data)
      setVersions(
        [...fresh.data.waiver_versions].sort((a, b) => b.version - a.version) as Version[],
      );
    setLive({ version: nextVersion, players: used.data?.players ?? 0 });
    setDirty(false);
  }

  const setPresetAndDays = (p: ResignPreset) => {
    edit(() => {
      setPreset(p);
      setDays(resignDays(p, p === 'custom' ? Number(customDays) || null : null));
    });
  };

  const shown =
    view.kind === 'version' || view.kind === 'diff'
      ? versions.find((v) => v.id === view.id)
      : undefined;
  const diff = useMemo(
    () => (view.kind === 'diff' && shown ? diffWords(shown.body, body) : null),
    [view, shown, body],
  );

  const insert = (block: string) => {
    const at = area.current?.selectionStart ?? body.length;
    const r = insertBlock(body, at, block);
    edit(() => setBody(r.body));
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(r.caret, r.caret);
    });
  };

  const modeValue = view.kind === 'preview' ? 'preview' : 'edit';

  return (
    <div className={styles.shell} data-testid="waiver-builder">
      <BuilderTopBar
        onBack={back}
        title={title}
        onTitle={(v) => edit(() => setTitle(v))}
        titleLabel="Waiver title"
        placeholder="Untitled waiver"
        maxLength={150}
        badge={{ label: live ? `Published v${live.version}` : `Draft v${nextVersion}` }}
        status={
          <SaveStatus
            save={save}
            dirty={dirty || (unpublished && Boolean(latest))}
            issues={tried ? issues.length : 0}
            neverSaved={!waiverId}
          />
        }
      >
        {view.kind === 'preview' ? (
          <SegmentedControl
            label="Preview device"
            value={device}
            options={[
              { value: 'web', label: 'Web' },
              { value: 'mobile', label: 'Mobile' },
            ]}
            onChange={setDevice}
          />
        ) : null}
        <SegmentedControl
          label="Mode"
          value={modeValue}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'preview', label: 'Preview' },
          ]}
          onChange={(m) => setView({ kind: m })}
        />
        <Button
          onClick={() => (issues.length ? setTried(true) : setConfirm(true))}
          disabled={Boolean(latest) && !unpublished}
        >
          <Icon name="rocket-launch" size="sm" />{' '}
          {latest && !unpublished ? 'Published' : `Publish v${nextVersion}`}
        </Button>
      </BuilderTopBar>
      <p className={styles.notice} role="note">
        The waiver builder works best on a desktop-width screen.
      </p>

      <div className={styles.body}>
        <main className={styles.stepPane}>
          <div className={styles.docWrap}>
            {live ? (
              <div className={styles.liveBanner} role="status">
                <Icon name="check-circle" /> v{live.version} is live.{' '}
                {live.players > 0
                  ? `${live.players} players will be asked to re-sign.`
                  : 'Nobody has to re-sign yet.'}
                {owner.teamId ? (
                  <Button
                    variant="secondary"
                    onClick={() => router.push(`/teams/${owner.teamId}/waivers`)}
                  >
                    View signatures
                  </Button>
                ) : null}
              </div>
            ) : null}

            {view.kind === 'preview' ? (
              <Preview title={title} body={body} mobile={device === 'mobile'} />
            ) : view.kind === 'diff' && shown && diff ? (
              <>
                <div className={styles.docBar}>
                  <Button variant="secondary" onClick={() => setView({ kind: 'edit' })}>
                    <Icon name="arrow-left" size="sm" /> Back to editing
                  </Button>
                  <strong>Comparing v{shown.version} with your draft</strong>
                  <Badge>
                    <Icon name="pencil" size="sm" /> {changeSummary(shown.body, body)}
                  </Badge>
                </div>
                <div className={styles.diffCols}>
                  <div className={styles.page}>
                    <span className={styles.kicker}>
                      v{shown.version} · Published {day(shown.published_at)}
                    </span>
                    <p className={styles.diffText}>
                      {diff
                        .filter((o) => o.type !== 'add')
                        .map((o, i) =>
                          o.type === 'del' ? (
                            <del key={i} className={styles.del}>
                              {o.text}
                            </del>
                          ) : (
                            <span key={i}>{o.text}</span>
                          ),
                        )}
                    </p>
                  </div>
                  <div className={styles.page}>
                    <span className={styles.kicker}>Draft v{nextVersion} · today</span>
                    <p className={styles.diffText}>
                      {diff
                        .filter((o) => o.type !== 'del')
                        .map((o, i) =>
                          o.type === 'add' ? (
                            <ins key={i} className={styles.ins}>
                              {o.text}
                            </ins>
                          ) : (
                            <span key={i}>{o.text}</span>
                          ),
                        )}
                    </p>
                  </div>
                </div>
              </>
            ) : view.kind === 'version' && shown ? (
              <>
                <div className={styles.docBar}>
                  <Button variant="secondary" onClick={() => setView({ kind: 'edit' })}>
                    <Icon name="arrow-left" size="sm" /> Back to editing
                  </Button>
                  <strong>Viewing v{shown.version}</strong>
                  <Badge tone="success">Published {day(shown.published_at)}</Badge>
                </div>
                <div className={styles.page}>
                  <h1 className={styles.section}>{shown.title}</h1>
                  {paragraphs(shown.body).map((p, i) => (
                    <p key={i} className={styles.para}>
                      {p}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles.docBar}>
                  <Button variant="secondary" onClick={() => insert(HEADING_PLACEHOLDER)}>
                    <Icon name="text-h" size="sm" /> Heading
                  </Button>
                  <Button variant="secondary" onClick={() => insert(INITIALS_LINE)}>
                    <Icon name="pen-nib" size="sm" /> Initials line
                  </Button>
                  <span
                    className={`${styles.counter} ${body.length > WAIVER_MAX_CHARS ? styles.counterBad : ''}`}
                    aria-live="polite"
                  >
                    {body.length.toLocaleString('en-US')} /{' '}
                    {WAIVER_MAX_CHARS.toLocaleString('en-US')}
                  </span>
                </div>
                {tried && issues.length ? (
                  <p className={styles.err} role="alert">
                    <Icon name="warning-circle" size="sm" /> {issues.join(' ')}
                  </p>
                ) : null}
                <div className={styles.page}>
                  <textarea
                    ref={area}
                    className={styles.docArea}
                    aria-label="Waiver text"
                    placeholder="Start typing, or paste your waiver text. Leave a blank line between paragraphs."
                    value={body}
                    onChange={(e) => edit(() => setBody(e.target.value))}
                  />
                  {!body.trim() ? (
                    <div className={styles.row}>
                      {WAIVER_TEMPLATES.map((t) => (
                        <Button
                          key={t.id}
                          variant="secondary"
                          onClick={() =>
                            edit(() => {
                              setBody(t.body);
                              if (!title.trim()) setTitle(t.title);
                            })
                          }
                        >
                          <Icon name="file-plus" size="sm" /> Start from {t.title}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className={styles.muted}>
                  <Icon name="signature" size="sm" /> Parents add their typed signature after
                  reading. Have counsel review waivers before publishing.
                </p>
              </>
            )}
          </div>
        </main>

        <aside className={styles.preview} aria-label="Waiver settings">
          <span className={styles.kicker}>Waiver settings</span>
          <details open>
            <summary>Settings</summary>
            <div className={styles.stack}>
              <span className={styles.muted}>Sign again after</span>
              <SegmentedControl
                label="Sign again after"
                value={preset}
                options={RESIGN_PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
                onChange={setPresetAndDays}
              />
              {preset === 'custom' ? (
                <TextField
                  label="Days"
                  inputMode="numeric"
                  value={customDays}
                  hint={`1 to ${RESIGN_MAX_DAYS}`}
                  onChange={(e) =>
                    edit(() => {
                      setCustomDays(e.target.value);
                      setDays(resignDays('custom', e.target.value ? Number(e.target.value) : null));
                    })
                  }
                />
              ) : null}
              <p className={styles.muted}>{resignSentence(days)}</p>
            </div>
          </details>
          <details open>
            <summary>Used by</summary>
            <div className={styles.stack}>
              {(used.data?.teams.length ?? 0) + (used.data?.regs.length ?? 0) === 0 ? (
                <p className={styles.muted}>Not used yet. Require it for a team in the Library.</p>
              ) : null}
              {used.data?.teams.map((t) => (
                <span key={t} className={styles.usedBy}>
                  <Icon name="users-three" size="sm" /> {t} · required
                </span>
              ))}
              {used.data?.regs.map((r) => (
                <span key={r.id} className={styles.usedBy}>
                  <Icon name="clipboard-text" size="sm" /> {r.title}
                </span>
              ))}
            </div>
          </details>
          <details open>
            <summary>Versions</summary>
            <ol className={styles.timeline}>
              <li className={`${styles.version} ${styles.versionNow}`}>
                <strong>Draft v{nextVersion}</strong>
                <span className={styles.muted}>Editing now · you</span>
                <span className={styles.muted}>This draft will become v{nextVersion}</span>
              </li>
              {versions.map((v) => (
                <li key={v.id} className={styles.version}>
                  <strong>v{v.version}</strong>
                  <span className={styles.muted}>
                    Published {day(v.published_at)} · {signers.data?.get(v.id) ?? 0} signers
                  </span>
                  <div className={styles.row}>
                    <Button variant="ghost" onClick={() => setView({ kind: 'version', id: v.id })}>
                      View
                    </Button>
                    <Button variant="ghost" onClick={() => setView({ kind: 'diff', id: v.id })}>
                      Compare with draft
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </div>

      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Publish v${nextVersion}?`}
        level="modal"
      >
        <div className={styles.stack}>
          <h2 className={styles.section}>Publish v{nextVersion}?</h2>
          <p className={styles.muted}>
            <Icon name="lock-simple" size="sm" /> Publishing freezes this text. People who signed
            earlier keep the version they signed.
          </p>
          {owner.teamId && latest ? (
            <div className={styles.reviewCard}>
              <div className={styles.reviewRow}>
                <span>Players who will be asked to re-sign</span>
                <strong>{used.data?.players ?? 0}</strong>
              </div>
              <span className={styles.muted}>
                Only players on teams that require this waiver. Everyone else is unaffected.
              </span>
            </div>
          ) : null}
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep editing
            </Button>
            <Button loading={publishing} onClick={() => void publish()}>
              <Icon name="rocket-launch" size="sm" /> Publish v{nextVersion}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** What a parent sees: the text, then the typed-signature step. Nothing here is saved or sent. */
function Preview({ title, body, mobile }: { title: string; body: string; mobile: boolean }) {
  return (
    <>
      <div className={styles.banner}>
        <Icon name="eye" size="sm" /> Preview · this is what parents see, including the signature
        step
      </div>
      <div className={mobile ? `${styles.phone} ${styles.phoneFrame}` : styles.page}>
        <h1 className={styles.section}>{title || 'Untitled waiver'}</h1>
        {paragraphs(body).map((p, i) => (
          <p key={i} className={styles.para}>
            {p}
          </p>
        ))}
        <h2 className={styles.section}>Sign</h2>
        <TextField label="Full legal name" disabled value="" onChange={() => undefined} />
        <TextField label="Relationship" disabled value="" onChange={() => undefined} />
        <label className={styles.switchRow}>
          <input type="checkbox" disabled />
          <span>I agree to sign electronically and that this counts as my signature.</span>
        </label>
        <Button disabled>Sign waiver</Button>
      </div>
    </>
  );
}

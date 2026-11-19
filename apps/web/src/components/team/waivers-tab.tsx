'use client';

import {
  WAIVER_TEMPLATES,
  friendlyError,
  matchesComplianceFilter,
  matchesQuery,
  progressSegments,
  remindable,
  summarizeCompliance,
  type ComplianceFilter,
} from '@athleit/core';
import {
  archiveWaiver,
  createWaiver,
  getWaiverCompliance,
  listWaiverReminders,
  listWaivers,
  remindWaiverSigners,
  setTeamRequiredWaiver,
} from '@athleit/db/registration';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  IconButton,
  IconCircle,
  Popover,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { ConfirmSheet, ListState, SearchField, shortDate } from './parts';
import { HeaderAction } from './team-hub';
import styles from './team.module.css';

const STATE_LABEL = { signed: 'Signed', expired: 'Expired', missing: 'Missing' } as const;
const STATE_ICON = {
  signed: 'check-circle',
  expired: 'clock-countdown',
  missing: 'warning-circle',
} as const;
const STATE_TONE = { signed: 'success', expired: 'warning', missing: 'danger' } as const;
const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Waivers: Compliance (who has signed, with reminders) and Library (the waivers themselves). */
export function WaiversTab() {
  const [tab, setTab] = useState<'compliance' | 'library'>('compliance');
  const { team, caps } = useTeam();
  const manage = caps.has('registration.manage');
  const newHref = `/manage/waivers/new?team=${team.id}&returnTo=${encodeURIComponent(`/teams/${team.id}/waivers`)}`;
  return (
    <div className={styles.stack}>
      {manage && tab === 'library' ? (
        <HeaderAction>
          <ButtonLink href={newHref}>
            <Icon name="plus" size="sm" /> New waiver
          </ButtonLink>
        </HeaderAction>
      ) : null}
      <SegmentedControl
        label="Waivers"
        value={tab}
        options={[
          { value: 'compliance', label: 'Compliance' },
          { value: 'library', label: 'Library' },
        ]}
        onChange={setTab}
      />
      {tab === 'compliance' ? <Compliance onLibrary={() => setTab('library')} /> : <Library />}
      <p className={styles.muted}>
        <Icon name="desktop" size="sm" /> Waivers are written on web. Parents read and sign on web
        and mobile.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ compliance
function Compliance({ onLibrary }: { onLibrary: () => void }) {
  const { team, caps } = useTeam();
  const client = getClient();
  const toast = useToast();
  const manage = caps.has('registration.manage');
  const [tick, setTick] = useState(0);
  const rows = useLoad(() => getWaiverCompliance(client, team.id), [team.id, tick]);
  const reminders = useLoad(
    () =>
      manage
        ? listWaiverReminders(client, team.id)
        : Promise.resolve({ data: new Map<string, string>(), error: null }),
    [team.id, manage, tick],
  );
  const versions = useLoad(() => listWaivers(client, { teamId: team.id }), [team.id]);
  const [filter, setFilter] = useState<ComplianceFilter>('needs');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sum = summarizeCompliance(rows.data ?? []);
  const seg = progressSegments(sum);
  const last = reminders.data ?? new Map<string, string>();
  const allRows = sum.groups.flatMap((g) => g.rows);
  const toRemind = remindable(allRows, last);
  const versionOf = (id: string) => {
    const v =
      (versions.data ?? []).find((w) => w.id === id)?.waiver_versions.map((x) => x.version) ?? [];
    return v.length ? `v${Math.max(...v)}` : '';
  };
  // The reminders list only holds the last 24 hours, so being in it means "reminded today".
  const reminded = (r: { player_id: string; waiver_id: string }) =>
    last.has(`${r.player_id}:${r.waiver_id}`);

  async function remind(opts: { waiverId?: string; playerId?: string }, key: string) {
    setError(null);
    setBusy(key);
    const r = await remindWaiverSigners(client, team.id, opts);
    setBusy(null);
    setConfirm(false);
    if (r.error) return setError(friendlyError(r.error));
    toast(
      r.data === 0
        ? 'Already reminded in the last 24 hours'
        : `Reminded ${r.data} ${r.data === 1 ? 'guardian' : 'guardians'}`,
    );
    setTick((n) => n + 1);
  }
  async function copyLink() {
    try {
      // Guardians sign from their registrations list after signing in; there is no per-player token link.
      await navigator.clipboard.writeText(`${window.location.origin}/registrations`);
      toast('Signing link copied');
    } catch {
      toast('Could not copy the link', 'danger');
    }
  }

  const none = !rows.loading && !rows.error && sum.total === 0;
  const clear = sum.total > 0 && sum.expired + sum.missing === 0;
  const withMissing = manage && toRemind.length > 0;

  return (
    <div className={styles.stack}>
      {withMissing ? (
        <HeaderAction>
          <Button onClick={() => setConfirm(true)}>
            <Icon name="bell-ringing" size="sm" /> Remind all missing
          </Button>
        </HeaderAction>
      ) : null}
      <FormMessage error={error} />
      <ListState
        name="waiver status"
        loading={rows.loading}
        error={rows.error}
        onRetry={rows.reload}
        empty={{
          when: none,
          icon: 'shield-check',
          text: 'No required waivers yet. Mark a waiver as required in the Library and its signatures will be tracked here.',
          action: (
            <Button variant="secondary" onClick={onLibrary}>
              <Icon name="books" size="sm" /> Open Library
            </Button>
          ),
        }}
      >
        <Card className={styles.stack}>
          <div className={styles.tiles}>
            {(['signed', 'expired', 'missing'] as const).map((k) => (
              <div key={k} className={styles.tile}>
                <span className={styles.tileLabel}>
                  <Icon name={STATE_ICON[k]} size="sm" weight="fill" /> {STATE_LABEL[k]}
                </span>
                <span className={styles.tileValue}>{sum[k]}</span>
              </div>
            ))}
          </div>
          <div
            className={styles.bar}
            role="img"
            aria-label={`${sum.signed} signed, ${sum.expired} expired, ${sum.missing} missing`}
          >
            <span className={styles.barOk} style={{ width: `${seg.signed}%` }} />
            <span className={styles.barWarn} style={{ width: `${seg.expired}%` }} />
            <span className={styles.barBad} style={{ width: `${seg.missing}%` }} />
          </div>
          {clear ? (
            <EmptyState
              icon="check"
              title="Everyone is up to date"
              body={`All ${sum.total} required signatures are in. ${sum.players} players, ${sum.waivers} ${sum.waivers === 1 ? 'waiver' : 'waivers'}.`}
            />
          ) : (
            <div>
              <strong>
                {sum.playersNeedingAttention}{' '}
                {sum.playersNeedingAttention === 1 ? 'player needs' : 'players need'} attention
              </strong>
              <p className={styles.muted}>
                of {sum.players} players across {sum.waivers} required{' '}
                {sum.waivers === 1 ? 'waiver' : 'waivers'}
              </p>
            </div>
          )}
        </Card>

        <div className={styles.toolbar}>
          <SegmentedControl
            label="Waiver status"
            value={filter}
            options={[
              { value: 'needs', label: `Needs attention ${sum.expired + sum.missing}` },
              { value: 'all', label: `All ${sum.total}` },
              { value: 'signed', label: `Signed ${sum.signed}` },
            ]}
            onChange={setFilter}
          />
          <SearchField label="Search players" value={search} onChange={setSearch} />
        </div>

        {sum.groups.map((g) => {
          const shown = g.rows.filter(
            (r) =>
              matchesComplianceFilter(r.state, filter) &&
              matchesQuery(search, `${r.first_name} ${r.last_name}`),
          );
          if (shown.length === 0 && (filter !== 'all' || search)) return null;
          const expanded = open[g.waiverId] ?? g.signed < g.total;
          return (
            <section key={g.waiverId} className={styles.group}>
              <button
                type="button"
                className={styles.groupHead}
                aria-expanded={expanded}
                onClick={() => setOpen((o) => ({ ...o, [g.waiverId]: !expanded }))}
              >
                <span className={`${styles.groupCount} ${styles.mono}`}>
                  {g.signed}/{g.total}
                </span>
                <span className={styles.grow}>
                  <strong>
                    {g.title} {versionOf(g.waiverId)}
                  </strong>
                  <span className={styles.muted}>
                    {' '}
                    {g.signed} of {g.total} players signed
                  </span>
                </span>
                <Icon name={expanded ? 'caret-up' : 'caret-down'} size="sm" />
              </button>
              {expanded ? (
                <ul className={styles.groupRows} data-testid="waiver-compliance">
                  {shown.map((r) => {
                    const done = r.state === 'signed';
                    const sent = reminded(r);
                    return (
                      <li key={`${r.player_id}-${r.waiver_id}`} className={styles.compRow}>
                        <Avatar name={`${r.first_name} ${r.last_name}`} size="sm" />
                        <span className={styles.grow}>
                          <strong>
                            {r.first_name} {r.last_name}
                          </strong>
                          <span className={styles.muted}>
                            {r.accepted_at ? ` Signed ${dateOf(r.accepted_at)}` : ' Never signed'}
                          </span>
                        </span>
                        <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>
                        {manage && !done ? (
                          <>
                            <Button
                              variant="secondary"
                              disabled={sent}
                              loading={busy === `${r.player_id}:${r.waiver_id}`}
                              onClick={() =>
                                void remind(
                                  { waiverId: r.waiver_id, playerId: r.player_id },
                                  `${r.player_id}:${r.waiver_id}`,
                                )
                              }
                            >
                              <Icon name="bell-ringing" size="sm" />{' '}
                              {sent ? 'Reminded' : 'Send reminder'}
                            </Button>
                            <IconButton
                              icon="link"
                              label={`Copy signing link for ${r.first_name}`}
                              onClick={() => void copyLink()}
                            />
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                  {shown.length === 0 ? (
                    <li className={styles.muted}>Nothing to show here.</li>
                  ) : null}
                </ul>
              ) : null}
            </section>
          );
        })}
      </ListState>

      <ConfirmSheet
        open={confirm}
        title={`Remind ${new Set(toRemind.map((r) => r.player_id)).size} ${new Set(toRemind.map((r) => r.player_id)).size === 1 ? 'guardian' : 'guardians'}?`}
        body="We will email and push a signing reminder for each missing or expired waiver. Nobody gets more than one reminder a day."
        confirmLabel={`Send ${toRemind.length} ${toRemind.length === 1 ? 'reminder' : 'reminders'}`}
        busy={busy === 'all'}
        onConfirm={() => void remind({}, 'all')}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

// -------------------------------------------------------------------------------------------------- library
function Library() {
  const { team, caps } = useTeam();
  const client = getClient();
  const router = useRouter();
  const toast = useToast();
  const manage = caps.has('registration.manage');
  const [tick, setTick] = useState(0);
  const waivers = useLoad(() => listWaivers(client, { teamId: team.id }), [team.id, tick]);
  const required = useLoad(async () => {
    const { data, error } = await client
      .from('team_required_waivers')
      .select('waiver_id')
      .eq('team_id', team.id);
    return error
      ? { data: null, error: { message: error.message } }
      : { data: (data ?? []).map((r) => r.waiver_id), error: null };
  }, [team.id, tick]);
  const compliance = useLoad(() => getWaiverCompliance(client, team.id), [team.id, tick]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const back = encodeURIComponent(`/teams/${team.id}/waivers`);
  const all = waivers.data ?? [];
  const reqIds = new Set(required.data ?? []);
  const sums = summarizeCompliance(compliance.data ?? []);
  const rows = all.filter(
    (w) =>
      matchesQuery(search, w.title) &&
      (status === 'all' ||
        (status === 'published' ? w.waiver_versions.length > 0 : w.waiver_versions.length === 0)),
  );

  async function toggle(id: string, on: boolean) {
    setError(null);
    const r = await setTeamRequiredWaiver(client, team.id, id, on);
    if (r.error) setError(friendlyError(r.error));
    setTick((n) => n + 1);
  }
  async function doArchive() {
    if (!archiving) return;
    setBusy('archive');
    const r = await archiveWaiver(client, archiving.id);
    setBusy(null);
    if (r.error) setError(friendlyError(r.error));
    else toast(`${archiving.title} archived`);
    setArchiving(null);
    setTick((n) => n + 1);
  }
  async function fromTemplate(id: string) {
    const t = WAIVER_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setBusy(id);
    const r = await createWaiver(client, { teamId: team.id }, t.title, t.body);
    setBusy(null);
    if (r.error) return setError(friendlyError(r.error));
    router.push(`/manage/waivers/${r.data}?returnTo=${back}`);
  }

  return (
    <div className={styles.stack}>
      <FormMessage error={error} />
      <ListState
        name="waivers"
        loading={waivers.loading || required.loading}
        error={waivers.error ?? required.error}
        onRetry={() => setTick((n) => n + 1)}
      >
        {all.length === 0 ? (
          <Card className={styles.stack}>
            <div className={styles.emptyHead}>
              <IconCircle>
                <Icon name="file-text" />
              </IconCircle>
              <h2 className={styles.section}>No waivers yet</h2>
              <p className={styles.muted}>
                Write a waiver once, then require it for any team or registration. Signers keep the
                version they signed.
              </p>
            </div>
            {manage ? (
              <div className={styles.cols}>
                {WAIVER_TEMPLATES.map((t) => (
                  <div key={t.id} className={styles.tile}>
                    <IconCircle>
                      <Icon name={t.icon} />
                    </IconCircle>
                    <strong>{t.title}</strong>
                    <span className={styles.muted}>{t.description}</span>
                    <div>
                      <Button
                        variant="secondary"
                        loading={busy === t.id}
                        onClick={() => void fromTemplate(t.id)}
                      >
                        Use template
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <p className={styles.muted}>
              <Icon name="scales" size="sm" /> Have counsel review waivers before publishing.
            </p>
          </Card>
        ) : (
          <>
            <div className={styles.toolbar}>
              <SearchField label="Search waivers" value={search} onChange={setSearch} />
              <SegmentedControl
                label="Status"
                value={status}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Draft' },
                ]}
                onChange={setStatus}
              />
              <SegmentedControl
                label="Layout"
                value={layout}
                options={[
                  { value: 'grid', label: 'Grid' },
                  { value: 'list', label: 'List' },
                ]}
                onChange={setLayout}
              />
            </div>
            {rows.length === 0 ? <p className={styles.muted}>No waivers match.</p> : null}
            <ul
              className={layout === 'grid' ? styles.cardGrid : styles.cardList}
              data-testid="waiver-library"
            >
              {rows.map((w) => {
                const v = Math.max(0, ...w.waiver_versions.map((x) => x.version));
                const g = sums.groups.find((x) => x.waiverId === w.id);
                const isReq = reqIds.has(w.id);
                return (
                  <li key={w.id} className={styles.waiverCard}>
                    <div className={`${styles.row} ${styles.between}`}>
                      <IconCircle>
                        <Icon name="file-text" />
                      </IconCircle>
                      <span className={styles.row}>
                        <Badge tone={v > 0 ? 'success' : 'neutral'}>
                          <Icon name={v > 0 ? 'check-circle' : 'pencil'} size="sm" />{' '}
                          {v > 0 ? `Published v${v}` : 'Draft'}
                        </Badge>
                        {manage ? (
                          <CardMenu
                            title={w.title}
                            onEdit={() => router.push(`/manage/waivers/${w.id}?returnTo=${back}`)}
                            onArchive={() => setArchiving({ id: w.id, title: w.title })}
                          />
                        ) : null}
                      </span>
                    </div>
                    <h3 className={styles.cardTitle}>
                      <a
                        href={`/manage/waivers/${w.id}?returnTo=${back}`}
                        className={styles.cardLink}
                      >
                        {w.title}
                      </a>
                    </h3>
                    <span className={styles.muted}>Required for</span>
                    <span className={styles.row}>
                      {isReq ? (
                        <Badge>{team.name}</Badge>
                      ) : (
                        <span className={styles.muted}>No teams yet</span>
                      )}
                    </span>
                    <span className={styles.muted}>
                      {g ? `${g.signed} signed` : '0 signed'} · Updated {shortDate(w.updated_at)}
                    </span>
                    {manage && v > 0 ? (
                      <label className={styles.switchLine}>
                        <input
                          type="checkbox"
                          checked={isReq}
                          onChange={(e) => void toggle(w.id, e.target.checked)}
                        />
                        <span>Required</span>
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className={styles.muted}>
              <Icon name="scales" size="sm" /> Have counsel review waivers before publishing.
            </p>
          </>
        )}
      </ListState>
      <ConfirmSheet
        open={archiving !== null}
        title={`Archive ${archiving?.title ?? ''}?`}
        body="It leaves the Library and can no longer be required. People who already signed keep their signed copy."
        confirmLabel="Archive"
        busy={busy === 'archive'}
        onConfirm={() => void doArchive()}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}

function CardMenu({
  title,
  onEdit,
  onArchive,
}: {
  title: string;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const item = (icon: 'pencil' | 'archive-box', label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <Icon name={icon} size="sm" /> {label}
    </button>
  );
  return (
    <>
      <span ref={anchor}>
        <IconButton
          icon="dots-three"
          label={`More actions for ${title}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        />
      </span>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="Waiver actions"
        align="end"
      >
        <div role="menu" className={styles.menu}>
          {item('pencil', 'Edit', onEdit)}
          {item('archive-box', 'Archive', onArchive)}
        </div>
      </Popover>
    </>
  );
}

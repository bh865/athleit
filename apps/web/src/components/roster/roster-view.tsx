'use client';

import {
  ROSTER_SORTS,
  ROSTER_STATUS_FILTERS,
  ageLabel,
  filterRoster,
  fullName,
  playerCountLabel,
  positionOptions,
  rosterCounts,
  sortRoster,
  teamTabHref,
  type RosterSort,
  type RosterStatusFilter,
} from '@athleit/core';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  PageHeader,
  Sheet,
} from '@/components/ui';

import { AddStep } from './add-step';
import { Jersey, StatusMark } from './parts';
import { PlayerAvatar } from './player-avatar';
import { PlayerPanel } from './player-panel';
import styles from './roster.module.css';
import { useMinWidth } from './use-media-query';
import { useRosterData, type RosterRow } from './use-roster-data';

const PANEL_BESIDE_MIN = 1100;
const AGE_COLUMN_MIN = 900;

/**
 * Roster page. Staff and club admins get the list (or jersey wall) with a side panel; parents and
 * players get the squad view (first names only). What shows follows capabilities; the database
 * decides what is actually returned (docs/permissions.md).
 */
export function RosterView() {
  const { team, caps, rows, ready, facts, roster, reloadAll } = useRosterData();
  const toast = useToast();
  const full = caps.has('roster.viewFull');
  const canPlace = caps.has('roster.place');
  const canEdit = caps.has('roster.edit');
  const canSeeContacts = caps.has('contacts.view');
  const positions = positionOptions(team.sport);
  // Side panel beside the list from 1100px; below that it is an overlay and the age column drops.
  const wide = useMinWidth(PANEL_BESIDE_MIN);
  const roomForAge = useMinWidth(AGE_COLUMN_MIN);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RosterStatusFilter>('active');
  const [sort, setSort] = useState<RosterSort>('jersey');
  const [view, setView] = useState<'list' | 'wall'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ playerId: string | null } | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!justAdded) return;
    const t = window.setTimeout(() => setJustAdded(null), 3000);
    return () => window.clearTimeout(t);
  }, [justAdded]);
  useEffect(() => {
    if (adding) addRef.current?.querySelector<HTMLElement>('select, input')?.focus();
  }, [adding]);

  const selected = rows.find((r) => r.team_player_id === selectedId) ?? null;
  const visible = sortRoster(filterRoster(rows, { query, status: full ? status : 'active' }), sort);
  const counts = rosterCounts(rows, canPlace ? ready.length : 0);
  const subtitle = `${team.name}${team.season_label ? ` · ${team.season_label}` : ''}`;
  const panelOpen = selected !== null;
  const stepOpen = adding !== null;

  const closePanel = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    if (id) requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  }, [selectedId]);

  const select = (r: RosterRow) => {
    setAdding(null);
    setSelectedId(r.team_player_id);
  };

  const requestsHref = teamTabHref(team.id, 'people', 'requests');
  const invitesHref = teamTabHref(team.id, 'people', 'invites');

  const header = (
    <PageHeader
      title="Roster"
      subtitle={subtitle}
      actions={
        canPlace ? (
          <>
            {ready.length === 0 && (
              <p className={styles.addHint}>
                Approve a join request first. <Link href={requestsHref}>Review requests</Link>
              </p>
            )}
            <Button
              variant={panelOpen || stepOpen ? 'secondary' : 'primary'}
              disabled={ready.length === 0}
              onClick={() => {
                setSelectedId(null);
                setAdding({ playerId: null });
              }}
            >
              <Icon name="plus" size="sm" /> Add player
            </Button>
          </>
        ) : undefined
      }
    />
  );

  if (roster.loading && rows.length === 0)
    return (
      <>
        {header}
        <LoadingSkeleton rows={5} />
      </>
    );
  if (roster.error)
    return (
      <>
        {header}
        <ErrorState
          message="Can’t load the roster. Check your connection. Nothing was changed."
          onRetry={roster.reload}
        />
      </>
    );

  const search = (
    <div className={styles.search}>
      <span className={styles.searchIcon} aria-hidden>
        <Icon name="magnifying-glass" size="sm" />
      </span>
      <input
        type="search"
        className={styles.searchInput}
        aria-label="Search players"
        placeholder="Search by name or number"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  // Parents and players: squad view ---------------------------------------------------------------
  if (!full) {
    return (
      <div className={styles.page}>
        {header}
        {rows.length === 0 ? (
          <EmptyState icon="users-three" title="No players on the roster yet." />
        ) : (
          <>
            <p className={styles.count}>{playerCountLabel(rows.length)}</p>
            <div className={styles.toolbar}>{search}</div>
            {visible.length === 0 ? (
              <NoResults query={query} onClear={() => setQuery('')} />
            ) : (
              <ul className={styles.squad} data-testid="roster-limited">
                {visible.map((r) => (
                  <li key={r.team_player_id} className={styles.tile}>
                    <Jersey value={r.jersey_number} className={styles.bigJersey} />
                    <span className={styles.name}>{r.first_name}</span>
                    {r.position && <span className={styles.pos}>{r.position}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.footnote}>Teammates are shown by first name only.</p>
          </>
        )}
      </div>
    );
  }

  // Staff and club admins ---------------------------------------------------------------------------
  const empty = rows.length === 0;
  const panel = selected && (
    <PlayerPanel
      key={`${selected.team_player_id}:${selected.status}:${selected.jersey_number}:${selected.position}`}
      row={selected}
      rows={rows}
      facts={selected.player_id ? facts.get(selected.player_id) : undefined}
      canEdit={canEdit}
      canSeeContacts={canSeeContacts}
      positions={positions}
      teamName={team.name}
      onClose={closePanel}
      onChanged={reloadAll}
      onRemoved={() => {
        setSelectedId(null);
        reloadAll();
      }}
    />
  );

  return (
    <div className={styles.page}>
      {header}

      {!empty && (
        <ul className={styles.summary} aria-label="Roster summary">
          <Stat label="Active" value={counts.active} />
          <Stat label="Inactive" value={counts.inactive} />
          {canPlace && <Stat label="Ready to add" value={counts.ready} />}
        </ul>
      )}

      {canPlace && ready.length > 0 && (
        <section className={styles.ready} aria-labelledby="ready-h">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="ready-h">
              Ready to add
            </h2>
            <p className={styles.muted}>
              {ready.length} approved {ready.length === 1 ? 'child' : 'children'} not on the roster
              yet.
            </p>
          </div>
          <ul className={styles.readyList}>
            {ready.map((c) => (
              <li key={c.playerId} className={styles.readyRow}>
                <PlayerAvatar name={c.name} size="sm" />
                <span className={styles.grow}>{c.name}</span>
                <Button
                  variant="secondary"
                  aria-label={`Add ${c.name} to the roster`}
                  onClick={() => {
                    setSelectedId(null);
                    setAdding({ playerId: c.playerId });
                  }}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
          {adding && (
            <div ref={addRef}>
              <AddStep
                key={adding.playerId ?? 'first'}
                teamId={team.id}
                candidates={ready}
                initialPlayerId={adding.playerId}
                rows={rows}
                positions={positions}
                onCancel={() => setAdding(null)}
                onPlaced={(playerId) => {
                  const child = ready.find((c) => c.playerId === playerId);
                  setAdding(null);
                  setQuery('');
                  setStatus('active');
                  setJustAdded(playerId);
                  toast(`${child?.firstName ?? 'Player'} is on the roster`);
                  reloadAll();
                }}
              />
            </div>
          )}
        </section>
      )}

      {empty ? (
        <EmptyState
          icon="users-three"
          title={canPlace ? 'Your roster is empty' : 'No players on the roster yet.'}
          {...(canPlace ? { body: 'Approve a join request, then add the child here.' } : {})}
          action={
            canPlace ? (
              <div className={styles.actions}>
                <ButtonLink variant="secondary" href={requestsHref}>
                  Review requests
                </ButtonLink>
                <ButtonLink variant="ghost" href={invitesHref}>
                  Open invites
                </ButtonLink>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className={`${styles.layout} ${wide && panel ? styles.layoutPanel : ''}`}>
          <div className={styles.main}>
            <div className={styles.toolbar}>
              {search}
              <div className={styles.chips} role="group" aria-label="Status filter">
                {ROSTER_STATUS_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    className={styles.chipBtn}
                    selected={status === f.value}
                    onClick={() => setStatus(f.value)}
                  >
                    {f.label}
                  </Chip>
                ))}
              </div>
              <div className={styles.tools}>
                <label className={styles.muted} htmlFor="roster-sort">
                  Sort
                </label>
                <select
                  id="roster-sort"
                  className={styles.sortSelect}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as RosterSort)}
                >
                  {ROSTER_SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <Chip
                  className={styles.chipBtn}
                  selected={view === 'wall'}
                  aria-label="Jersey wall view"
                  onClick={() => setView(view === 'wall' ? 'list' : 'wall')}
                >
                  <Icon name="squares-four" size="sm" /> Wall
                </Chip>
              </div>
            </div>

            {!canEdit && (
              <p className={styles.readOnly}>
                <Icon name="lock-simple" size="sm" /> Read-only for club admins
              </p>
            )}

            {visible.length === 0 ? (
              <NoResults
                query={query}
                status={status}
                onClear={() => {
                  setQuery('');
                  setStatus('all');
                }}
              />
            ) : view === 'wall' ? (
              <ul className={styles.wall} data-testid="roster-list">
                {visible.map((r) => (
                  <li key={r.team_player_id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.team_player_id, el);
                      }}
                      className={[
                        styles.tile,
                        r.status === 'inactive' ? styles.tileInactive : '',
                        selectedId === r.team_player_id ? styles.tileSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => select(r)}
                    >
                      <Jersey value={r.jersey_number} className={styles.bigJersey} />
                      <span className={styles.name}>{fullName(r)}</span>
                      {r.position && <span className={styles.pos}>{r.position}</span>}
                      {r.status === 'inactive' && <StatusMark status={r.status} />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul
                className={`${styles.list} ${!roomForAge || (panel && !wide) ? styles.noAge : ''}`}
                data-testid="roster-list"
              >
                <li className={styles.head} aria-hidden>
                  <span>No.</span>
                  <span>Player</span>
                  <span className={styles.ageCol}>Age</span>
                  <span>Pos</span>
                  <span>Status</span>
                </li>
                {visible.map((r) => {
                  const f = r.player_id ? facts.get(r.player_id) : undefined;
                  return (
                    <li key={r.team_player_id} className={styles.listItem}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) rowRefs.current.set(r.team_player_id, el);
                        }}
                        className={[
                          styles.row,
                          r.status === 'inactive' ? styles.rowInactive : '',
                          selectedId === r.team_player_id ? styles.rowSelected : '',
                          r.player_id && r.player_id === justAdded ? styles.rowNew : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-current={selectedId === r.team_player_id || undefined}
                        onClick={() => select(r)}
                      >
                        <Jersey value={r.jersey_number} className={styles.jersey} />
                        <span className={styles.who}>
                          <PlayerAvatar name={fullName(r)} photoPath={f?.photoPath} size="sm" />
                          <span className={styles.name}>{fullName(r)}</span>
                        </span>
                        <span className={`${styles.age} ${styles.ageCol}`}>
                          {f ? ageLabel(f.age) : ''}
                        </span>
                        <span className={styles.posCell}>
                          {r.position && <span className={styles.pos}>{r.position}</span>}
                        </span>
                        <StatusMark status={r.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {panel && wide && (
            <aside aria-label="Player details" className={styles.panel}>
              {panel}
            </aside>
          )}
        </div>
      )}

      {panel && !wide && (
        <Sheet open onClose={closePanel} title="Player details" placement="right">
          {panel}
        </Sheet>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </li>
  );
}

function NoResults({
  query,
  status,
  onClear,
}: {
  query: string;
  status?: RosterStatusFilter;
  onClear: () => void;
}) {
  return (
    <EmptyState
      icon="magnifying-glass"
      title={
        query.trim()
          ? `No players match “${query.trim()}”`
          : status && status !== 'all'
            ? `No ${status} players`
            : 'No players found'
      }
      body="Try a name or a jersey number."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear search
        </Button>
      }
    />
  );
}

'use client';

import { matchesQuery, registrationPriceLabel } from '@athleit/core';
import {
  getCapacitySummary,
  listRegistrationEvents,
  type CapacitySummary,
} from '@athleit/db/registration';
import { useState } from 'react';

import { useTeam } from '@/components/app/team-context';
import { Badge, ButtonLink, Icon, ListGroup, ListRow, SegmentedControl } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { ListState, SearchField, ShowMore, StatTile, useShowMore } from './parts';
import { HeaderAction } from './team-hub';
import styles from './team.module.css';

type Tab = 'open' | 'draft' | 'closed';
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
const KIND: Record<string, string> = {
  season: 'Season',
  tryout: 'Tryout',
  camp: 'Camp',
  clinic: 'Clinic',
  other: 'Event',
};

/** Registrations: the team's events only (Open / Draft / Closed). Forms have their own tab. */
export function RegistrationsTab() {
  const { team, caps } = useTeam();
  const manage = caps.has('registration.manage');
  const newHref = `/manage/registration/new?team=${team.id}`;

  const events = useLoad(async () => {
    const res = await listRegistrationEvents(getClient(), { teamId: team.id });
    if (res.error) return res;
    const open = res.data.filter((e) => e.status === 'open');
    const sums = await Promise.all(open.map((e) => getCapacitySummary(getClient(), e.id)));
    const byId = new Map<string, CapacitySummary | null>();
    open.forEach((e, i) => byId.set(e.id, sums[i]?.data ?? null));
    return { data: { rows: res.data, byId }, error: null };
  }, [team.id]);

  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const rows = events.data?.rows ?? [];
  const group = (e: { status: string }): Tab =>
    e.status === 'open' ? 'open' : e.status === 'draft' ? 'draft' : 'closed';
  const counts = { open: 0, draft: 0, closed: 0 } as Record<Tab, number>;
  for (const e of rows) counts[group(e)] += 1;
  const sum = (pick: (s: CapacitySummary) => number) =>
    [...(events.data?.byId.values() ?? [])].reduce((n, s) => n + (s ? pick(s) : 0), 0);
  const shown = rows.filter((e) => group(e) === tab && matchesQuery(search, e.title));
  const page = useShowMore(shown, `${tab}|${search}`);

  return (
    <div className={styles.stack}>
      {manage ? (
        <HeaderAction>
          <ButtonLink href={newHref}>
            <Icon name="plus" size="sm" /> New registration
          </ButtonLink>
        </HeaderAction>
      ) : null}

      <div className={styles.tiles}>
        <StatTile label="Open now" value={counts.open} note="registrations" />
        <StatTile label="Registered" value={sum((s) => s.taken)} note="across open events" />
        <StatTile
          label="To review"
          value={sum((s) => s.submitted + s.pending_verification)}
          note="waiting on you"
          tone="warn"
        />
        <StatTile label="Waitlisted" value={sum((s) => s.waitlisted)} note="across events" />
      </div>

      <div className={styles.toolbar}>
        <SegmentedControl
          label="Registration status"
          value={tab}
          options={(['open', 'draft', 'closed'] as const).map((t) => ({
            value: t,
            label: `${t.charAt(0).toUpperCase()}${t.slice(1)} ${counts[t]}`,
          }))}
          onChange={setTab}
        />
        <SearchField label="Search registrations" value={search} onChange={setSearch} />
      </div>

      <ListState
        name="registrations"
        loading={events.loading}
        error={events.error}
        onRetry={events.reload}
        empty={{
          when: rows.length === 0,
          icon: 'clipboard-text',
          text: 'No registrations yet. Create one to collect sign-ups, fees and waivers for a season or a one-off event.',
          action: manage ? (
            <ButtonLink href={newHref}>
              <Icon name="plus" size="sm" /> New registration
            </ButtonLink>
          ) : undefined,
        }}
      >
        {shown.length === 0 ? (
          <p className={styles.muted}>
            No {tab} registrations{search ? ' match that search' : ''}.
          </p>
        ) : (
          <ListGroup data-testid="registration-events">
            {page.items.map((e) => {
              const s = events.data?.byId.get(e.id);
              const full = s && s.capacity > 0 && s.taken >= s.capacity;
              const toReview = s ? s.submitted + s.pending_verification : 0;
              return (
                <li key={e.id}>
                  <ListRow
                    href={
                      e.status === 'draft'
                        ? `/manage/registration/${e.id}/edit`
                        : `/manage/registration/${e.id}`
                    }
                    title={e.title}
                    subtitle={[
                      KIND[e.kind] ?? e.kind,
                      e.status === 'draft'
                        ? 'not published'
                        : [day(e.opens_at), day(e.closes_at)].filter(Boolean).join(' to '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <>
                        {s ? (
                          <span className={styles.count}>
                            {s.taken}
                            {s.capacity > 0 ? ` of ${s.capacity} spots` : ' registered'}
                          </span>
                        ) : null}
                        <span className={styles.count}>
                          {registrationPriceLabel(e.price_cents)}
                        </span>
                        {toReview > 0 ? <Badge tone="warning">{toReview} to review</Badge> : null}
                        <Badge
                          tone={
                            e.status === 'open'
                              ? 'success'
                              : e.status === 'draft'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {full
                            ? 'Full'
                            : e.status === 'open'
                              ? 'Open'
                              : e.status === 'draft'
                                ? 'Draft'
                                : 'Closed'}
                        </Badge>
                      </>
                    }
                  />
                </li>
              );
            })}
          </ListGroup>
        )}
        <ShowMore
          total={page.total}
          shown={page.items.length}
          remaining={page.remaining}
          onMore={page.more}
        />
      </ListState>
      <p className={styles.muted}>
        <Icon name="desktop" size="sm" /> Registrations and forms are created on web. Parents
        complete them on web and mobile.
      </p>
    </div>
  );
}

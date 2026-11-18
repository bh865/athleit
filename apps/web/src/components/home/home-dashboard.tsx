'use client';

import {
  capabilitiesForPlace,
  homeTileIds,
  rolesLabel,
  describeEventTime,
  payViewsFor,
  previewOf,
  teamForScreen,
  type RsvpStatus,
} from '@athleit/core';
import { getJoinRequests, getRoster, getThreadList } from '@athleit/db/api';
import { getNextUp } from '@athleit/db/scheduling';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useApp } from '@/components/app/app-provider';
import { DueCard, StaffPaymentsCard } from '@/components/payments/home-cards';
import { RsvpControls } from '@/components/schedule/rsvp-controls';
import { useViewerZone } from '@/components/schedule/use-viewer-zone';
import { Avatar, ButtonLink, Card, Icon, PageHeader, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import {
  AnnouncementTile,
  CalendarTile,
  DocumentsTile,
  FamilyTile,
  NotificationHealthTile,
  PayoutsTile,
  PlacesTile,
  SetupTile,
} from './more-tiles';
import { ApprovalsTile, RecordTile, RegistrationsTile, WaiversTile, WeekTile } from './tiles';
import { AttentionStrip } from './attention-strip';
import styles from './home.module.css';
import { useHomeData } from './use-home-data';

const greeting = (d: Date) => {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

interface Child {
  player_id: string;
  first_name: string;
  status: RsvpStatus | null;
}

/** "Next up": kicker, title, time and place, mono RSVP counts (staff) or Going / Can't go (parents). */
function NextUpHero({ canManage }: { canManage: boolean }) {
  const zone = useViewerZone();
  const res = useLoad(() => getNextUp(getClient(), 1), []);
  const top = res.data?.[0];
  if (res.loading) return <Card className={styles.hero} aria-busy />;
  if (!top) {
    return (
      <Card className={styles.heroText} data-testid="next-up">
        <span className={styles.kicker}>Next up</span>
        <p className={styles.meta}>Nothing is scheduled yet.</p>
        <div>
          <ButtonLink href="/schedule" variant="secondary">
            {canManage ? 'Add an event' : 'Open schedule'}
          </ButtonLink>
        </div>
      </Card>
    );
  }
  const t = describeEventTime(top.starts_at, top.ends_at, top.timezone, zone ?? 'UTC');
  const place = top.location_name ?? top.location_text ?? null;
  const children = (top.children as unknown as Child[]) ?? [];
  return (
    <Card className={styles.hero} data-testid="next-up">
      <div className={styles.heroText}>
        <span className={styles.kicker}>
          Next up · {t.weekdayShort} {t.startLabel}
        </span>
        <Link href={`/events/${top.event_id}`} className={styles.heroTitle}>
          {top.title}
        </Link>
        <p className={styles.meta}>
          {t.dateLabel} · {t.startLabel}
          {place ? ` · ${place}` : ''}
        </p>
        {top.is_staff ? (
          <div className={styles.counts} role="group" aria-label="RSVP counts">
            {[
              { v: top.going, l: 'Going' },
              { v: top.not_going, l: 'Can’t go' },
              { v: top.no_reply, l: 'No reply' },
            ].map((c) => (
              <div key={c.l} className={styles.count}>
                <span className={styles.countValue} aria-label={`${c.v} ${c.l}`}>
                  {c.v}
                </span>
                <span className={styles.countLabel}>{c.l}</span>
              </div>
            ))}
          </div>
        ) : null}
        {children.map((c) => (
          <RsvpControls
            key={c.player_id}
            eventId={top.event_id}
            child={c}
            showName={children.length > 1}
          />
        ))}
      </div>
      {place ? (
        <div className={styles.tile}>
          <span className={styles.pin}>
            <Icon name="map-pin" weight="fill" size="lg" />
          </span>
          <Text variant="bodyBold">{place}</Text>
          <a
            className={styles.mapLink}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Maps
          </a>
        </div>
      ) : null}
    </Card>
  );
}

function MessagesCard({ teamId }: { teamId: string }) {
  const res = useLoad(() => getThreadList(getClient(), teamId), [teamId]);
  const rows = (res.data ?? []).slice(0, 3);
  return (
    <Card className={styles.card} data-testid="home-messages">
      <div className={styles.cardHead}>
        <Text variant="bodyBold">Messages</Text>
        <Link href="/messages" className={styles.cardLink}>
          Open
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>No conversations yet.</p>
      ) : (
        <ul className={styles.threads} aria-label="Recent conversations">
          {rows.map((r) => {
            const unread = r.unread_count > 0;
            return (
              <li key={r.thread_id}>
                <Link href={`/messages/${r.thread_id}`} className={styles.thread}>
                  <span className={styles.threadText}>
                    <span className={styles.threadTitle}>
                      {r.title ?? r.other_name ?? 'Message'}
                    </span>
                    <span className={styles.threadPreview}>
                      {previewOf(
                        r.last_body === null && !r.last_hidden && !r.last_deleted
                          ? null
                          : {
                              body: r.last_body ?? '',
                              deleted: r.last_deleted,
                              hidden: r.last_hidden,
                            },
                      )}
                    </span>
                  </span>
                  {unread ? <span className={styles.dot} aria-label="Unread" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RosterCard({ teamId, staff }: { teamId: string; staff: boolean }) {
  const roster = useLoad(() => getRoster(getClient(), teamId), [teamId]);
  const pending = useLoad(
    () =>
      staff
        ? getJoinRequests(getClient(), teamId)
        : Promise.resolve({ data: [] as { status: string }[], error: null }),
    [teamId, staff],
  );
  const rows = (roster.data ?? []) as { first_name: string; status?: string }[];
  const active = rows.filter((r) => r.status === undefined || r.status === 'active');
  const waiting = (pending.data ?? []).filter((r) => r.status === 'pending').length;
  return (
    <Card className={styles.card} data-testid="home-roster">
      <div className={styles.cardHead}>
        <Text variant="bodyBold">Roster</Text>
        <Link href="/roster" className={styles.cardLink}>
          Open
        </Link>
      </div>
      <div className={styles.stats}>
        <div className={styles.count}>
          <span className={styles.countValue}>{rows.length}</span>
          <span className={styles.countLabel}>Players</span>
        </div>
        {staff ? (
          <>
            <div className={styles.count}>
              <span className={styles.countValue}>{active.length}</span>
              <span className={styles.countLabel}>Active</span>
            </div>
            <div className={styles.count}>
              <span className={styles.countValue}>{waiting}</span>
              <span className={styles.countLabel}>Pending</span>
            </div>
          </>
        ) : null}
      </div>
      <div className={styles.stack} aria-hidden>
        {rows.slice(0, 5).map((r, i) => (
          <Avatar key={`${r.first_name}${i}`} name={r.first_name} size="sm" />
        ))}
      </div>
    </Card>
  );
}

/**
 * Web Home. Blocks follow capabilities, not roles: staff see RSVP counts, collection and the full
 * roster stats; parents see Going / Can't go for their children and what they owe; someone who is
 * both sees both.
 */
export function HomeDashboard() {
  const { active, contexts, displayName } = useApp();
  const team = teamForScreen(contexts, active);
  const caps = team ? capabilitiesForPlace(contexts, 'team', team.id) : new Set<string>();
  const views = payViewsFor(contexts, active);
  const now = new Date();
  const first = displayName?.split(' ')[0];
  const staff = Boolean(team?.isStaff);
  const clubAdmin = contexts.find((c) => c.kind === 'club');
  const { attention } = useHomeData(contexts, active);
  const tiles = new Set(homeTileIds(contexts, active));
  const teamId = team?.id ?? null;
  const staffReg = Boolean(staff && caps.has('registration.view'));
  const showTeamGroup = Boolean(staff || views.staff || (clubAdmin && !team) || tiles.has('setup'));
  const teamRoles = team
    ? (contexts.find((c) => c.kind === 'team' && c.id === team.id)?.roles ?? [])
    : [];
  const teamScope = team ? `${team.title} · ${rolesLabel(teamRoles)}` : (clubAdmin?.title ?? '');
  const familyScope = contexts.find((c) => c.kind === 'family')?.title ?? '';

  return (
    <div className={styles.page}>
      <PageHeader
        title={`${greeting(now)}${first ? `, ${first}` : ''}`}
        titleTestId="display-name"
        subtitle={now.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
        actions={
          staff ? (
            <ButtonLink href="/schedule">
              <Icon name="plus" size="sm" /> New event
            </ButtonLink>
          ) : (
            <ButtonLink href="/schedule" variant="secondary">
              Schedule
            </ButtonLink>
          )
        }
      />
      <AttentionStrip shown={attention.shown} more={attention.more} />
      <NextUpHero canManage={staff} />
      <div className={styles.row3}>
        {tiles.has('thisWeek') ? (
          <WeekTile teamId={teamId} staff={staff} family={views.payer} />
        ) : null}
        {tiles.has('teamRecord') && teamId ? <RecordTile teamId={teamId} /> : null}
        {team ? <MessagesCard teamId={team.id} /> : null}
        {tiles.has('announcement') && teamId ? <AnnouncementTile teamId={teamId} /> : null}
      </div>
      {showTeamGroup ? (
        <Group id="team" label="For your team" scope={teamScope}>
          {tiles.has('approvals') && teamId && caps.has('joinRequests.decide') ? (
            <ApprovalsTile teamId={teamId} />
          ) : null}
          {staffReg && tiles.has('waivers') ? (
            <WaiversTile teamId={teamId} staff family={false} />
          ) : null}
          {staffReg && tiles.has('registrations') ? (
            <RegistrationsTile teamId={teamId} staff />
          ) : null}
          {views.staff && caps.has('payments.view') ? (
            <div className={styles.card} data-testid="home-payments">
              <StaffPaymentsCard
                owner={
                  views.staff.kind === 'team'
                    ? { teamId: views.staff.id }
                    : { clubId: views.staff.id }
                }
                href="/pay"
              />
            </div>
          ) : null}
          {views.staff && tiles.has('payouts') ? (
            <PayoutsTile
              owner={
                views.staff.kind === 'team'
                  ? { teamId: views.staff.id }
                  : { clubId: views.staff.id }
              }
            />
          ) : null}
          {team && caps.has('roster.viewLimited') ? (
            <RosterCard teamId={team.id} staff={caps.has('roster.viewFull')} />
          ) : null}
          {tiles.has('setup') && teamId ? <SetupTile teamId={teamId} /> : null}
          {tiles.has('notificationHealth') && teamId && caps.has('members.manage') ? (
            <NotificationHealthTile teamId={teamId} />
          ) : null}
          {!team && clubAdmin ? (
            <Card className={styles.card}>
              <Text variant="bodyBold">{clubAdmin.title}</Text>
              <Link href={`/clubs/${clubAdmin.id}`} className={styles.cardLink}>
                Open club
              </Link>
            </Card>
          ) : null}
        </Group>
      ) : null}
      {views.payer || (team && caps.has('roster.viewLimited') && !showTeamGroup) ? (
        <Group id="family" label="For your family" scope={familyScope}>
          {views.payer ? (
            <div className={styles.card} data-testid={showTeamGroup ? 'home-due' : 'home-payments'}>
              <DueCard />
            </div>
          ) : null}
          {views.payer && tiles.has('waivers') ? (
            <WaiversTile teamId={teamId} staff={false} family />
          ) : null}
          {views.payer && tiles.has('registrations') ? (
            <RegistrationsTile teamId={teamId} staff={false} />
          ) : null}
          {tiles.has('family') ? <FamilyTile /> : null}
          {team && caps.has('roster.viewLimited') && !showTeamGroup ? (
            <RosterCard teamId={team.id} staff={false} />
          ) : null}
        </Group>
      ) : null}
      <Group id="more" label="More" scope="">
        {tiles.has('documents') && teamId ? <DocumentsTile teamId={teamId} /> : null}
        {tiles.has('calendar') ? <CalendarTile /> : null}
        {tiles.has('places') ? <PlacesTile places={contexts} /> : null}
      </Group>
    </div>
  );
}

/** A labelled group of tiles with a scope line ("U12 Falcons · Admin"). Hidden when it holds no tile. */
function Group({
  id,
  label,
  scope,
  children,
}: {
  id: string;
  label: string;
  scope: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`home-group-${id}`}
      className={styles.group}
      data-testid={`home-group-${id}`}
    >
      <div className={styles.groupHead}>
        <h2 id={`home-group-${id}`} className={styles.kicker}>
          {label}
        </h2>
        {scope ? <span className={styles.scope}>{scope}</span> : null}
      </div>
      <div className={styles.row3}>{children}</div>
    </section>
  );
}

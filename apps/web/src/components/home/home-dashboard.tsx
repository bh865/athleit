'use client';

import {
  capabilitiesForPlace,
  homeTileIds,
  rolesLabel,
  payViewsFor,
  teamForScreen,
} from '@athleit/core';
import { getJoinRequests, getRoster } from '@athleit/db/api';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useApp } from '@/components/app/app-provider';
import { StaffPaymentsCard } from '@/components/payments/home-cards';
import { Avatar, ButtonLink, Card, Icon, PageHeader, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { DueTile, DocumentsTile, FamilyTile, SetupTile } from './more-tiles';
import { ApprovalsTile, RecordTile, RegistrationsTile, WaiversTile } from './tiles';
import { AttentionStrip } from './attention-strip';
import styles from './home.module.css';
import { NextUpHero } from './next-up-hero';
import { useHomeData } from './use-home-data';

const greeting = (d: Date) => {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

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
 * Web Home. Blocks follow capabilities, not roles: staff see RSVP counts, collection and the full roster
 * stats; parents see Going / Can't go for their children and what they owe; someone who is both sees both.
 * Order: header, Needs your attention, Next up beside Team record, "For your team", "For your family", Documents.
 */
export function HomeDashboard() {
  const { active, contexts, displayName } = useApp();
  const team = teamForScreen(contexts, active);
  const caps = team ? capabilitiesForPlace(contexts, 'team', team.id) : new Set<string>();
  const views = payViewsFor(contexts, active);
  const first = displayName?.split(' ')[0];
  const staff = Boolean(team?.isStaff);
  const clubAdmin = contexts.find((c) => c.kind === 'club');
  const { attention, loading, error, reload, refresh, now } = useHomeData(contexts, active);
  const tiles = new Set(homeTileIds(contexts, active));
  const teamId = team?.id ?? null;
  const staffReg = Boolean(staff && caps.has('registration.view'));
  const showTeamGroup = Boolean(staff || views.staff || (clubAdmin && !team) || tiles.has('setup'));
  const showFamilyGroup = Boolean(
    views.payer || (team && caps.has('roster.viewLimited') && !showTeamGroup),
  );
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
              <Icon name="calendar-blank" size="sm" /> Schedule
            </ButtonLink>
          )
        }
      />
      <AttentionStrip
        attention={attention}
        loading={loading}
        error={error}
        onRetry={reload}
        onResolved={refresh}
        now={now}
      />
      {tiles.has('nextUp') || tiles.has('teamRecord') ? (
        <div className={styles.heroRow}>
          <NextUpHero teamId={teamId} canManage={staff} />
          {tiles.has('teamRecord') && teamId ? <RecordTile teamId={teamId} /> : null}
        </div>
      ) : null}
      {showTeamGroup ? (
        <Group id="team" label="For your team" scope={teamScope} showHead={showFamilyGroup}>
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
          {team && caps.has('roster.viewLimited') ? (
            <RosterCard teamId={team.id} staff={caps.has('roster.viewFull')} />
          ) : null}
          {tiles.has('setup') && teamId ? <SetupTile teamId={teamId} /> : null}
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
      {showFamilyGroup ? (
        <Group id="family" label="For your family" scope={familyScope} showHead={showTeamGroup}>
          {views.payer ? <DueTile id={showTeamGroup ? 'home-due' : 'home-payments'} /> : null}
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
      {tiles.has('documents') && teamId ? (
        <Group id="more" label="Documents" scope="" showHead={false}>
          <DocumentsTile teamId={teamId} />
        </Group>
      ) : null}
    </div>
  );
}

/** A labelled group of tiles with a scope line ("U12 Falcons · Admin"). Hidden when it holds no tile. */
function Group({
  id,
  label,
  scope,
  showHead,
  children,
}: {
  id: string;
  label: string;
  scope: string;
  showHead: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`home-group-${id}`}
      className={styles.group}
      data-testid={`home-group-${id}`}
    >
      <div className={showHead ? styles.groupHead : styles.srOnly}>
        <h2 id={`home-group-${id}`} className={styles.kicker}>
          {label}
        </h2>
        {scope ? <span className={styles.scope}>{scope}</span> : null}
      </div>
      <div className={styles.tiles}>{children}</div>
    </section>
  );
}

import {
  capabilitiesForPlace,
  homeTileIds,
  rolesLabel,
  payViewsFor,
  teamForScreen,
} from '@athleit/core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { H1 } from '@/components/app/kit';
import { AttentionStrip } from '@/components/home/attention-strip';
import { ApprovalsTile, RecordTile, RegistrationsTile, WaiversTile } from '@/components/home/tiles';
import {
  DocumentsTile,
  DueTile,
  FamilyTile,
  GroupHead,
  OutstandingTile,
  RosterTile,
  SetupTile,
} from '@/components/home/more-tiles';
import { useHomeData } from '@/components/home/use-home-data';
import { NotificationsAsk } from '@/components/onboarding/notifications-ask';
import { FirstRun, PendingStrip } from '@/components/onboarding/first-run';
import { NextUpCard } from '@/components/schedule/next-up-card';
import { useApp } from '@/lib/app-provider';
import { kv, PENDING_INVITE_KEY } from '@/lib/kv';

/** "Good evening" style greeting from the local hour. */
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/**
 * Home: greeting, Needs your attention, Next up with Team record, capability-driven team and family tiles, Documents. Resumes a pending invite first.
 * It never redirects into a team or family page: those are one tap away below, and the role
 * switcher in the header still jumps straight to them.
 */
export default function HomeScreen() {
  const { contexts, active, displayName, status } = useApp();
  const { attention, loading, error, reload, refresh, tick, now } = useHomeData(contexts, active);
  const tiles = new Set(homeTileIds(contexts, active));
  const team = teamForScreen(contexts, active);
  const caps = team ? capabilitiesForPlace(contexts, 'team', team.id) : new Set<string>();
  const payer = payViewsFor(contexts, active).payer;
  const views = payViewsFor(contexts, active);
  const owner = views.staff
    ? views.staff.kind === 'team'
      ? { teamId: views.staff.id }
      : { clubId: views.staff.id }
    : null;
  const teamRoles = team
    ? (contexts.find((c) => c.kind === 'team' && c.id === team.id)?.roles ?? [])
    : [];
  const staffReg = Boolean(team?.isStaff && caps.has('registration.view'));
  const router = useRouter();

  useEffect(() => {
    if (status !== 'ready') return;
    let live = true;
    kv.get(PENDING_INVITE_KEY).then(async (token) => {
      if (!live) return;
      if (token) {
        await kv.remove(PENDING_INVITE_KEY);
        router.replace(
          (token.startsWith('__claim__')
            ? `/claim/${token.slice(9)}`
            : `/invite/${token}`) as never,
        );
      }
    });
    return () => {
      live = false;
    };
  }, [status, router]);

  return (
    <AppScreen>
      <NotificationsAsk />
      {contexts.length > 0 ? (
        <>
          <PendingStrip />
          <H1>
            {greeting()}
            {displayName ? `,\n${displayName.split(' ')[0]}` : ''}
          </H1>
          <AttentionStrip
            attention={attention}
            loading={loading}
            error={error}
            onRetry={reload}
            onResolved={refresh}
            now={now}
          />
          {tiles.has('nextUp') ? (
            <NextUpCard
              teamId={team?.id ?? null}
              canManage={Boolean(team?.isStaff)}
              reloadKey={tick}
            />
          ) : null}
          {tiles.has('teamRecord') && team ? <RecordTile teamId={team.id} /> : null}
          {team?.isStaff || owner ? (
            <>
              {payer ? (
                <GroupHead
                  label="For your team"
                  scope={team ? `${team.title} · ${rolesLabel(teamRoles)}` : ''}
                />
              ) : null}
              {tiles.has('approvals') && team && caps.has('joinRequests.decide') ? (
                <ApprovalsTile teamId={team.id} />
              ) : null}
              {staffReg && tiles.has('waivers') ? (
                <WaiversTile teamId={team?.id ?? null} staff family={false} />
              ) : null}
              {staffReg && tiles.has('registrations') ? (
                <RegistrationsTile teamId={team?.id ?? null} staff />
              ) : null}
              {owner && caps.has('payments.view') ? <OutstandingTile owner={owner} /> : null}
              {team && caps.has('roster.viewLimited') ? (
                <RosterTile teamId={team.id} staff={caps.has('roster.viewFull')} />
              ) : null}
              {tiles.has('setup') && team ? <SetupTile teamId={team.id} /> : null}
            </>
          ) : null}
          {payer ? (
            <>
              {team?.isStaff || owner ? <GroupHead label="For your family" /> : null}
              <DueTile />
              {tiles.has('waivers') ? (
                <WaiversTile teamId={team?.id ?? null} staff={false} family />
              ) : null}
              {tiles.has('registrations') ? (
                <RegistrationsTile teamId={team?.id ?? null} staff={false} />
              ) : null}
              {tiles.has('family') ? <FamilyTile /> : null}
            </>
          ) : null}
          {team && caps.has('roster.viewLimited') && !(team.isStaff || owner) ? (
            <RosterTile teamId={team.id} staff={false} />
          ) : null}
          {tiles.has('documents') && team ? <DocumentsTile teamId={team.id} /> : null}
        </>
      ) : (
        <FirstRun displayName={displayName} />
      )}
    </AppScreen>
  );
}

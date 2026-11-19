import {
  parsePeopleView,
  parseTeamTab,
  TEAM_TAB_LABEL,
  teamTabParams,
  visibleTeamTabs,
  type PeopleView,
  type TeamTab,
} from '@athleit/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { useScreenTitle } from '@/components/app/screen-title';
import { StaffScreen } from '@/components/payments/staff-screen';
import { DocumentsSection } from '@/components/registration/documents';
import { DocumentsTab } from '@/components/team/documents-tab';
import { TeamHubProvider, useTeamHub } from '@/components/team/hub';
import { OverviewTab } from '@/components/team/overview-tab';
import { TabPills } from '@/components/team/parts';
import { PeopleTab } from '@/components/team/people-tab';
import { RegistrationsTab } from '@/components/team/registrations-tab';
import { SettingsTab } from '@/components/team/settings-tab';
import { TeamProvider, useTeam } from '@/components/team/team-context';
import { WaiversTab } from '@/components/team/waivers-tab';

function TeamBody() {
  const { team, caps } = useTeam();
  const router = useRouter();
  const hub = useTeamHub();
  // Deep links (Home tiles, notifications) arrive as ?section=&view=.
  const params = useLocalSearchParams<{ section?: string; view?: string }>();
  const staff = caps.has('team.details');
  // Forms are built on the web only; mobile keeps the forms list inside Registrations.
  const tabs = visibleTeamTabs(caps).filter((t) => t !== 'forms');
  const fromLink = parseTeamTab(params.section);
  const [payKey, setPayKey] = useState(0);
  const [pick, setPick] = useState<{
    from: string | undefined;
    tab: TeamTab;
    view: PeopleView | null;
  } | null>(null);
  // A tap overrides the link until the link changes again.
  const linkKey = `${params.section ?? ''}|${params.view ?? ''}`;
  const chosen = pick && pick.from === linkKey ? pick : null;
  const wanted = chosen?.tab ?? fromLink ?? 'overview';
  const active: TeamTab = (tabs as TeamTab[]).includes(wanted) ? wanted : 'overview';
  const view = chosen ? chosen.view : parsePeopleView(params.view);

  const sport = team.sport.charAt(0).toUpperCase() + team.sport.slice(1);
  const readOnly = !caps.has('roster.edit') && caps.has('roster.viewFull');
  useScreenTitle(
    team.name,
    staff ? `${sport} · ${team.season_label}${readOnly ? ' · Read only' : ''}` : 'Documents',
  );

  // Staff only (and the linked club admin, read-only). Everyone else already has Roster, Schedule,
  // Messages and Pay in the main navigation. The Documents shelf stays open to anyone who can read it:
  // parents and players reach it from Home and have nowhere else to open it.
  const documentsOnly = !staff && caps.has('documents.view');
  useEffect(() => {
    if (!staff && !documentsOnly) router.replace('/');
  }, [staff, documentsOnly, router]);

  if (!staff) {
    return documentsOnly ? (
      <>
        <DocumentsSection owner={{ teamId: team.id }} />
      </>
    ) : null;
  }

  const open = (p: { section: TeamTab; view?: PeopleView }) =>
    setPick({ from: linkKey, tab: p.section, view: p.view ?? null });

  return (
    <>
      <TabPills
        tabs={tabs}
        active={active}
        counts={hub.counts}
        labels={TEAM_TAB_LABEL}
        onPick={(t) => {
          // Tapping Payments again goes back to its list (the page has no second back button).
          if (t === active && t === 'payments') setPayKey((k) => k + 1);
          else open(teamTabParams(t));
        }}
      />
      {active === 'overview' && <OverviewTab onOpen={open} />}
      {active === 'people' && (
        <PeopleTab view={view} onView={(v) => open(teamTabParams('people', v))} />
      )}
      {active === 'payments' && (
        <StaffScreen
          key={payKey}
          owner={{ teamId: team.id }}
          canSend={caps.has('payments.manage')}
          embedded
        />
      )}
      {active === 'registrations' && <RegistrationsTab />}
      {active === 'waivers' && <WaiversTab />}
      {active === 'documents' && <DocumentsTab />}
      {active === 'settings' && <SettingsTab />}
    </>
  );
}

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AppScreen>
      <TeamProvider teamId={id}>
        <TeamHubProvider>
          <TeamBody />
        </TeamHubProvider>
      </TeamProvider>
    </AppScreen>
  );
}

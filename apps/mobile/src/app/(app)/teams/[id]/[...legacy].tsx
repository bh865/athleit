import { legacyTeamTarget, parsePeopleView, parseTeamTab, teamTabParams } from '@athleit/core';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Web-style team links (notifications use /teams/:id/waivers, Home used /teams/:id/requests) land on the
 * single team screen with the right tab selected.
 */
export default function LegacyTeamPath() {
  const { id, legacy, view } = useLocalSearchParams<{
    id: string;
    legacy: string | string[];
    view?: string;
  }>();
  const segments = Array.isArray(legacy) ? legacy : [legacy ?? ''];
  const known = legacyTeamTarget(segments);
  if (known?.kind === 'schedule') return <Redirect href="/schedule" />;
  // /teams/:id/people?view=requests (the web shape) and the old names both land on the right tab.
  const tab = known?.kind === 'tab' ? known.tab : (parseTeamTab(segments[0]) ?? 'overview');
  const p = teamTabParams(tab, known?.kind === 'tab' ? known.view : parsePeopleView(view));
  return <Redirect href={{ pathname: '/teams/[id]', params: { id, ...p } } as never} />;
}

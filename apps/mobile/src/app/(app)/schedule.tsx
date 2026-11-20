import {
  applyFilters,
  capabilitiesForPlace,
  groupAgenda,
  hasActiveFilters,
  localDateKey,
  monthRange,
  monthGrid,
  monthTitle,
  NO_FILTERS,
  shiftMonth,
  showTeamName,
  addDays,
  groupByLocalDay,
  type ScheduleFilters,
} from '@athleit/core';
import {
  getHouseholdScheduleRange,
  getTeamRecord,
  getTeamScheduleRange,
} from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, LoadState } from '@/components/app/kit';
import { FilterRow, FilterSheet, MonthView, MoreSheet, WeekStrip } from '@/components/schedule/agenda-parts';
import { CalendarFeedSheet } from '@/components/schedule/calendar-feed';
import { EventCard } from '@/components/schedule/event-card';
import { EventFormSheet } from '@/components/schedule/event-form';
import { fromHouseholdRows, fromTeamRows, type ScheduleItem } from '@/components/schedule/items';
import { OpponentsSheet, PlacesSheet } from '@/components/schedule/places-opponents';
import { useAgenda, type ScheduleScope } from '@/components/schedule/use-agenda';
import { Button, Icon, SegmentedControl, Text, useTheme, useToast } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { viewerZone } from '@/lib/viewer-zone';

/**
 * Schedule: Agenda and Month. Agenda is grouped by day with a week strip, Upcoming and Past, filters in a sheet
 * and the usual rows (chips and quick actions for families, the counts bar for staff). Places, Opponents and
 * Calendar link live under More. Staff add events with the round plus.
 */
export default function ScheduleScreen() {
  const { active, contexts } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { theme } = useTheme();
  const c = theme.color;
  const zone = viewerZone();
  const teamId = active?.kind === 'team' ? active.id : null;
  const canManage = teamId ? capabilitiesForPlace(contexts, 'team', teamId).has('schedule.manage') : false;
  const scope: ScheduleScope | null = active?.kind === 'family' ? { kind: 'household' } : teamId ? { kind: 'team', teamId } : null;
  const family = scope?.kind === 'household';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = localDateKey(now, zone);

  const [mode, setMode] = useState<'agenda' | 'month'>('agenda');
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [filters, setFilters] = useState<ScheduleFilters>(NO_FILTERS);
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split('-').map(Number) as [number, number];
    return { year: y, month: m };
  });
  const [sheet, setSheet] = useState<'filters' | 'more' | 'new' | 'places' | 'opponents' | 'feed' | null>(null);

  // Agenda
  const agenda = useAgenda(scope, when, today, now);
  const filtered = useMemo(() => {
    const list = applyFilters(agenda.items, filters, now);
    return picked && mode === 'agenda' ? list.filter((i) => localDateKey(i.starts_at, i.timezone) === picked) : list;
  }, [agenda.items, filters, now, picked, mode]);
  const days = useMemo(() => groupAgenda(filtered, today, when === 'upcoming' ? 'asc' : 'desc'), [filtered, today, when]);

  // Month
  const grid = useMemo(() => monthGrid(month.year, month.month), [month]);
  const range = useMemo(() => monthRange(grid), [grid]);
  const monthRes = useLoad<ScheduleItem[]>(async () => {
    if (!scope || mode !== 'month') return { data: [], error: null };
    if (scope.kind === 'team') {
      const r = await getTeamScheduleRange(supabase, scope.teamId, range.from, range.to);
      return r.error ? r : { data: fromTeamRows(r.data), error: null };
    }
    const r = await getHouseholdScheduleRange(supabase, range.from, range.to);
    return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
  }, [scope?.kind, teamId, range.from, range.to, mode]);
  const monthItems = useMemo(() => applyFilters(monthRes.data ?? [], filters, now), [monthRes.data, filters, now]);
  const byDay = useMemo(() => groupByLocalDay(monthItems), [monthItems]);

  // Record header for Past (team places)
  const record = useLoad(
    () => (when === 'past' && scope?.kind === 'team' ? getTeamRecord(supabase, scope.teamId) : Promise.resolve({ data: null, error: null })),
    [when, teamId],
  );

  // Children and teams for the filter sheet
  const { kids, teams } = useMemo(() => {
    const k = new Map<string, string>();
    const t = new Map<string, string>();
    for (const i of [...agenda.items, ...(monthRes.data ?? [])]) {
      for (const ch of i.children ?? []) k.set(ch.player_id, ch.first_name);
      if (i.team_name) t.set(i.team_id, i.team_name);
    }
    return { kids: [...k], teams: [...t] };
  }, [agenda.items, monthRes.data]);

  const reloadAll = () => {
    agenda.reload();
    monthRes.reload();
  };
  const showTeam = family && showTeamName(agenda.items);
  const weekHas = (k: string) => agenda.items.some((i) => localDateKey(i.starts_at, i.timezone) === k);
  const open = (id: string) => router.push(`/events/${id}`);
  const rec = record.data;

  return (
    <AppScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Schedule</H1>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={() => setSheet('more')}
            testID="schedule-more"
            style={{ width: componentTokens.iconButton.size, height: componentTokens.iconButton.size, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="dots-three" color={c.ink} />
          </Pressable>
          {canManage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New event"
              onPress={() => setSheet('new')}
              testID="new-event"
              style={{ width: componentTokens.iconButton.size, height: componentTokens.iconButton.size, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="plus" color={c.accentInk} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <SegmentedControl
        label="View"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setPicked(null);
        }}
        options={[
          { value: 'agenda', label: 'Agenda' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <FilterRow
        filters={filters}
        onChange={setFilters}
        onOpen={() => setSheet('filters')}
        childName={(id) => kids.find(([k]) => k === id)?.[1]}
        teamName={(id) => teams.find(([k]) => k === id)?.[1]}
      />

      {mode === 'agenda' ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <SegmentedControl
                label="Show"
                value={when}
                onChange={(w) => {
                  setWhen(w);
                  setPicked(null);
                }}
                options={[
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'past', label: 'Past' },
                ]}
              />
            </View>
            <Button
              title="Today"
              variant="ghost"
              onPress={() => {
                setWhen('upcoming');
                setAnchor(today);
                setPicked(null);
              }}
            />
          </View>
          {when === 'upcoming' ? (
            <WeekStrip
              anchor={anchor}
              today={today}
              picked={picked}
              hasEvents={weekHas}
              onPick={setPicked}
              onShift={(d) => setAnchor(addDays(anchor, d * 7))}
            />
          ) : rec && rec.games > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[3] }} testID="record-header">
              <Text variant="monoLg">
                {rec.wins}-{rec.losses}-{rec.ties}
              </Text>
              <Text variant="caption" muted>
                W-L-T · {rec.season_label} · {rec.games} {rec.games === 1 ? 'game' : 'games'}
              </Text>
            </View>
          ) : null}
          <LoadState
            loading={agenda.loading}
            error={agenda.error}
            empty={days.length === 0}
            emptyText={
              hasActiveFilters(filters) || picked
                ? 'No events match.'
                : when === 'upcoming'
                  ? canManage
                    ? 'Nothing coming up. Tap the plus to add a practice or game.'
                    : 'Nothing coming up yet.'
                  : 'No past events yet.'
            }
            emptyAction={hasActiveFilters(filters) || picked ? <Button title="Clear filters" variant="secondary" onPress={() => { setFilters(NO_FILTERS); setPicked(null); }} /> : undefined}
            onRetry={agenda.reload}
          >
            <View style={{ gap: space[4] }}>
              {days.map((d) => (
                <View key={d.dateKey} style={{ gap: space[3] }} accessibilityLabel={d.heading}>
                  <Text variant="label" muted={!d.isToday} accessibilityRole="header">
                    {d.heading.toUpperCase()}
                  </Text>
                  {d.items.map((it) => (
                    <EventCard
                      key={it.id}
                      item={it}
                      now={now}
                      onPress={() => open(it.id)}
                      showTeam={showTeam}
                      showCounts={canManage && when === 'upcoming'}
                      onChanged={reloadAll}
                    />
                  ))}
                </View>
              ))}
              {agenda.hasMore && days.length > 0 && !picked ? (
                <Button
                  title={when === 'upcoming' ? 'Show later events' : 'Show earlier events'}
                  variant="secondary"
                  loading={agenda.loadingMore}
                  onPress={agenda.showMore}
                />
              ) : null}
            </View>
          </LoadState>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => { const s = shiftMonth(month.year, month.month, -1); setMonth({ year: s.year, month: s.month }); setPicked(null); }} style={{ minWidth: componentTokens.minTarget, minHeight: componentTokens.minTarget, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="caret-left" size="sm" />
            </Pressable>
            <Text variant="bodyBold" accessibilityLiveRegion="polite">
              {monthTitle(month.year, month.month)}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => { const s = shiftMonth(month.year, month.month, 1); setMonth({ year: s.year, month: s.month }); setPicked(null); }} style={{ minWidth: componentTokens.minTarget, minHeight: componentTokens.minTarget, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="caret-right" size="sm" />
            </Pressable>
          </View>
          <LoadState loading={monthRes.loading && !monthRes.data} error={monthRes.error} onRetry={monthRes.reload}>
            <MonthView year={month.year} month={month.month} today={today} picked={picked} itemsByDay={byDay} onPick={setPicked} />
            {picked ? (
              <View style={{ gap: space[3] }} testID="day-list">
                <Text variant="label" muted accessibilityRole="header">
                  {picked === today ? 'TODAY' : picked}
                </Text>
                {(byDay.get(picked) ?? []).length === 0 ? (
                  <Text muted>Nothing scheduled this day.</Text>
                ) : (
                  (byDay.get(picked) ?? []).map((it) => (
                    <EventCard key={it.id} item={it} now={now} onPress={() => open(it.id)} showTeam={showTeam} showCounts={canManage} onChanged={reloadAll} />
                  ))
                )}
              </View>
            ) : (
              <Text muted>Pick a day to see its events.</Text>
            )}
          </LoadState>
        </>
      )}

      <FilterSheet
        open={sheet === 'filters'}
        onClose={() => setSheet(null)}
        filters={filters}
        onChange={setFilters}
        family={Boolean(family)}
        children={kids}
        teams={teams}
      />
      <MoreSheet
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        canManage={canManage}
        onChoose={(k) => setSheet(k)}
      />
      {teamId ? (
        <>
          <EventFormSheet
            open={sheet === 'new'}
            onClose={() => setSheet(null)}
            teamId={teamId}
            onSaved={(m) => {
              toast(m);
              reloadAll();
            }}
          />
          <PlacesSheet open={sheet === 'places'} onClose={() => setSheet(null)} teamId={teamId} />
          <OpponentsSheet open={sheet === 'opponents'} onClose={() => setSheet(null)} teamId={teamId} />
        </>
      ) : null}
      <CalendarFeedSheet open={sheet === 'feed'} onClose={() => setSheet(null)} />
    </AppScreen>
  );
}

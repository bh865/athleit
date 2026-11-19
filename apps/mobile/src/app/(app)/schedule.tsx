import { capabilitiesForPlace } from '@athleit/core';
import { getHouseholdSchedule, getTeamSchedule } from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, LoadState } from '@/components/app/kit';
import { CalendarFeedSheet } from '@/components/schedule/calendar-feed';
import { EventCard } from '@/components/schedule/event-card';
import { EventFormSheet } from '@/components/schedule/event-form';
import { fromHouseholdRows, fromTeamRows } from '@/components/schedule/items';
import { Button, Icon, SegmentedControl, useTheme, useToast } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

/** Schedule: large title, Upcoming / Past, event cards. Staff add events; everyone gets the calendar link. */
export default function ScheduleScreen() {
  const { active, contexts } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { theme } = useTheme();
  const c = theme.color;
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [creating, setCreating] = useState(false);
  const [feed, setFeed] = useState(false);
  const teamId = active?.kind === 'team' ? active.id : null;
  const canManage = teamId
    ? capabilitiesForPlace(contexts, 'team', teamId).has('schedule.manage')
    : false;
  const mode = active?.kind === 'family' ? 'household' : teamId ? 'team' : 'none';

  const res = useLoad(async () => {
    if (mode === 'household') {
      const r = await getHouseholdSchedule(supabase, when, 60);
      return r.error ? r : { data: fromHouseholdRows(r.data), error: null };
    }
    if (mode === 'team' && teamId) {
      const r = await getTeamSchedule(supabase, teamId, when, 60);
      return r.error ? r : { data: fromTeamRows(r.data), error: null };
    }
    return { data: [], error: null };
  }, [mode, teamId, when]);
  const items = useMemo(() => res.data ?? [], [res.data]);

  return (
    <AppScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>Schedule</H1>
        {canManage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New event"
            onPress={() => setCreating(true)}
            testID="new-event"
            style={{
              width: componentTokens.iconButton.size,
              height: componentTokens.iconButton.size,
              borderRadius: radius.pill,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="plus" color={c.accentInk} />
          </Pressable>
        ) : null}
      </View>
      <SegmentedControl
        label="Show"
        value={when}
        onChange={setWhen}
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      <LoadState
        loading={res.loading}
        error={res.error}
        empty={items.length === 0}
        emptyText={when === 'upcoming' ? 'Nothing coming up yet.' : 'No past events.'}
        onRetry={res.reload}
      >
        <View style={{ gap: space[3] }}>
          {items.map((it) => (
            <EventCard key={it.id} item={it} onPress={() => router.push(`/events/${it.id}`)} />
          ))}
        </View>
      </LoadState>
      <Button title="Calendar link" icon="link" variant="ghost" onPress={() => setFeed(true)} />
      {teamId ? (
        <EventFormSheet
          open={creating}
          onClose={() => setCreating(false)}
          teamId={teamId}
          onSaved={(m) => {
            toast(m);
            res.reload();
          }}
        />
      ) : null}
      <CalendarFeedSheet open={feed} onClose={() => setFeed(false)} />
    </AppScreen>
  );
}

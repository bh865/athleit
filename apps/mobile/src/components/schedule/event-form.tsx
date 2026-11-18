import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  MAX_SERIES_OCCURRENCES,
  createEventSchema,
  friendlyError,
  localDateKey,
  zonedTimeToInstant,
  type EventType,
} from '@athleit/core';
import {
  addLocation,
  addOpponent,
  createEvent,
  getLocations,
  getOpponents,
  type LocationRow,
  type OpponentRow,
} from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Choice, FormMessage } from '@/components/app/kit';
import { Button, Chip, DatePicker, Sheet, Text, TextField, TimePicker } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { viewerZone } from '@/lib/viewer-zone';

const DAYS = [
  { n: 1, l: 'Mon' },
  { n: 2, l: 'Tue' },
  { n: 3, l: 'Wed' },
  { n: 4, l: 'Thu' },
  { n: 5, l: 'Fri' },
  { n: 6, l: 'Sat' },
  { n: 7, l: 'Sun' },
] as const;
const NONE = '';
const TYPED = '__typed';
const NEW = '__new';

/** New event (single or weekly). Dates and times are typed (YYYY-MM-DD, HH:MM) in the device's time zone. */
export function EventFormSheet({
  open,
  onClose,
  teamId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  onSaved: (message: string) => void;
}) {
  return open ? <Body onClose={onClose} teamId={teamId} onSaved={onSaved} /> : null;
}

function Body({
  onClose,
  teamId,
  onSaved,
}: {
  onClose: () => void;
  teamId: string;
  onSaved: (m: string) => void;
}) {
  const zone = viewerZone();
  const [type, setType] = useState<EventType>('practice');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDateKey(new Date(), zone));
  const [start, setStart] = useState('17:30');
  const [end, setEnd] = useState('19:00');
  const [loc, setLoc] = useState(NONE);
  const [locText, setLocText] = useState('');
  const [opp, setOpp] = useState(NONE);
  const [oppName, setOppName] = useState('');
  const [homeAway, setHomeAway] = useState<'none' | 'home' | 'away'>('none');
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [days, setDays] = useState<number[]>([]);
  const [count, setCount] = useState('8');
  const [places, setPlaces] = useState<LocationRow[]>([]);
  const [opps, setOpps] = useState<OpponentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([getLocations(supabase, teamId), getOpponents(supabase, teamId)]).then(
      ([l, o]) => {
        if (!live) return;
        setPlaces(l.data ?? []);
        setOpps(o.data ?? []);
      },
    );
    return () => {
      live = false;
    };
  }, [teamId]);

  async function submit() {
    setError(null);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(start) ||
      !/^\d{2}:\d{2}$/.test(end)
    )
      return setError('Choose a date and start and end times.');
    setBusy(true);
    try {
      let locationId = loc && loc !== TYPED ? loc : null;
      const locationText = loc === TYPED ? locText.trim() || null : null;
      if (loc === TYPED && locationText) {
        const r = await addLocation(supabase, { team_id: teamId, name: locationText });
        if (r.error) return setError(friendlyError(r.error));
        locationId = r.data?.id ?? null;
      }
      let opponentId = type === 'game' && opp && opp !== NEW ? opp : null;
      if (type === 'game' && opp === NEW && oppName.trim()) {
        const r = await addOpponent(supabase, teamId, oppName.trim());
        if (r.error) return setError(friendlyError(r.error));
        opponentId = r.data?.id ?? null;
      }
      const input = {
        team_id: teamId,
        type,
        title,
        starts_at: zonedTimeToInstant(date, start, zone).toISOString(),
        ends_at: zonedTimeToInstant(date, end, zone).toISOString(),
        timezone: zone,
        location_id: locationId,
        location_text: null,
        opponent_id: opponentId,
        home_away: type === 'game' && homeAway !== 'none' ? homeAway : null,
        recurrence:
          repeat === 'weekly' ? { weekdays: days, interval: 1, count: Number(count) } : null,
      };
      const parsed = createEventSchema.safeParse(input);
      if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the details.');
      const res = await createEvent(supabase, input);
      if (res.error) return setError(friendlyError(res.error));
      onClose();
      const n = res.data?.occurrences ?? 1;
      onSaved(n > 1 ? `${n} ${EVENT_TYPE_LABELS[type].toLowerCase()}s added` : 'Event added');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="New event">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space[4] }}
        style={{ maxHeight: 560 }}
      >
        <Text variant="heading">New event</Text>
        <Choice
          label="Type"
          value={type}
          onChange={setType}
          options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
        />
        <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <DatePicker
          label="Date"
          value={date}
          onChange={setDate}
          required
          yearSpan={{ before: 1, after: 3 }}
        />
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <TimePicker label="Starts" value={start} onChange={setStart} required />
          </View>
          <View style={{ flex: 1 }}>
            <TimePicker label="Ends" value={end} onChange={setEnd} required />
          </View>
        </View>
        <Text variant="caption" muted>
          Times are in {zone.replaceAll('_', ' ')}.
        </Text>
        <Choice
          label="Location"
          value={loc}
          onChange={setLoc}
          options={[
            { value: NONE, label: 'None' },
            ...places.map((l) => ({ value: l.id, label: l.name })),
            { value: TYPED, label: 'New place…' },
          ]}
        />
        {loc === TYPED ? (
          <TextField label="Place name" value={locText} onChangeText={setLocText} maxLength={100} />
        ) : null}
        {type === 'game' ? (
          <>
            <Choice
              label="Opponent"
              value={opp}
              onChange={setOpp}
              options={[
                { value: NONE, label: 'None' },
                ...opps.map((o) => ({ value: o.id, label: o.name })),
                { value: NEW, label: 'New opponent…' },
              ]}
            />
            {opp === NEW ? (
              <TextField
                label="Opponent name"
                value={oppName}
                onChangeText={setOppName}
                maxLength={100}
              />
            ) : null}
            <Choice
              label="Home or away"
              value={homeAway}
              onChange={setHomeAway}
              options={[
                { value: 'none', label: 'Not set' },
                { value: 'home', label: 'Home' },
                { value: 'away', label: 'Away' },
              ]}
            />
          </>
        ) : null}
        <Choice
          label="Repeat"
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: 'once', label: 'Doesn’t repeat' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
        {repeat === 'weekly' ? (
          <>
            <View
              accessibilityLabel="Repeat on"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
            >
              {DAYS.map((d) => (
                <Chip
                  key={d.n}
                  label={d.l}
                  selected={days.includes(d.n)}
                  accessibilityRole="button"
                  onPress={() =>
                    setDays(
                      days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n].sort(),
                    )
                  }
                />
              ))}
            </View>
            <TextField
              label="Number of events"
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
              hint={`Up to ${MAX_SERIES_OCCURRENCES}, within one year.`}
            />
          </>
        ) : null}
        <FormMessage error={error} />
        <Button title="Add to schedule" onPress={submit} loading={busy} testID="save-event" />
      </ScrollView>
    </Sheet>
  );
}

import {
  EDIT_SCOPES,
  EDIT_SCOPE_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  MAX_SERIES_OCCURRENCES,
  createEventSchema,
  describeEventTime,
  friendlyError,
  localDateKey,
  localTimeKey,
  locationFromSelection,
  placeText,
  previewRepeat,
  type EditScope,
  type EventType,
  type PlaceSelection,
  zonedTimeToInstant,
} from '@athleit/core';
import {
  addLocation,
  addOpponent,
  createEvent,
  getLocations,
  getOpponents,
  updateEvent,
  type EventDetail,
  type LocationRow,
  type OpponentRow,
} from '@athleit/db/scheduling';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Choice, FormMessage } from '@/components/app/kit';
import {
  Button,
  Chip,
  DatePicker,
  PlaceAutocomplete,
  Sheet,
  Text,
  TextField,
  TimePicker,
  useTheme,
} from '@/components/ui';
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
const SCOPE_EFFECT: Record<EditScope, string> = {
  this: 'Only this event changes. The rest of the series stays as it is.',
  this_and_following: 'This event and every later one in the series change.',
  all: 'Every event in the series changes, past ones included.',
};
const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** New or edit event, in sections. Editing is new on mobile and asks for the series scope first. */
export function EventFormSheet({
  open,
  onClose,
  teamId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  editing?: EventDetail | undefined;
  onSaved: (message: string) => void;
}) {
  return open ? <Body onClose={onClose} teamId={teamId} editing={editing} onSaved={onSaved} /> : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[3] }} accessibilityLabel={title}>
      <Text variant="label" muted accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Body({
  onClose,
  teamId,
  editing,
  onSaved,
}: {
  onClose: () => void;
  teamId: string;
  editing?: EventDetail | undefined;
  onSaved: (m: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const viewer = viewerZone();
  const zone = editing?.timezone ?? viewer;
  const initial = useMemo(
    () => ({
      type: (editing?.type as EventType) ?? ('practice' as EventType),
      title: editing?.title ?? '',
      date: editing ? localDateKey(editing.starts_at, editing.timezone) : localDateKey(new Date(), zone),
      start: editing ? localTimeKey(editing.starts_at, editing.timezone) : '17:30',
      end: editing ? localTimeKey(editing.ends_at, editing.timezone) : '19:00',
      loc: editing ? (editing.location_id ?? (editing.location_text ? TYPED : NONE)) : NONE,
      locText: editing?.location_text ?? '',
      opp: editing?.opponent_id ?? NONE,
      homeAway: (editing?.home_away ?? 'none') as 'none' | 'home' | 'away' | 'neutral',
      arrive: editing?.arrive_early_minutes?.toString() ?? '',
      notes: editing?.notes ?? '',
    }),
    [editing, zone],
  );
  const [type, setType] = useState<EventType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [loc, setLoc] = useState(initial.loc);
  const [locText, setLocText] = useState(initial.locText);
  const [picked, setPicked] = useState<PlaceSelection | null>(null);
  const [saveLoc, setSaveLoc] = useState(false);
  const [opp, setOpp] = useState(initial.opp);
  const [oppName, setOppName] = useState('');
  const [homeAway, setHomeAway] = useState(initial.homeAway);
  const [arrive, setArrive] = useState(initial.arrive);
  const [notes, setNotes] = useState(initial.notes);
  const [scope, setScope] = useState<EditScope>('this');
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [days, setDays] = useState<number[]>([]);
  const [count, setCount] = useState('8');
  const [places, setPlaces] = useState<LocationRow[]>([]);
  const [opps, setOpps] = useState<OpponentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([getLocations(supabase, teamId), getOpponents(supabase, teamId)]).then(([l, o]) => {
      if (!live) return;
      setPlaces(l.data ?? []);
      setOpps(o.data ?? []);
    });
    return () => {
      live = false;
    };
  }, [teamId]);

  const isGame = type === 'game';
  const isSeries = Boolean(editing?.series_id);
  const multi = isSeries && scope !== 'this';
  const preview = useMemo(
    () => (repeat === 'weekly' && !editing ? previewRepeat({ startDate: date, weekdays: days, count: Number(count) || 0, type }) : null),
    [repeat, editing, date, days, count, type],
  );
  const yourTime = useMemo(() => {
    if (zone === viewer || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return describeEventTime(zonedTimeToInstant(date, start, zone).toISOString(), zonedTimeToInstant(date, end, zone).toISOString(), zone, viewer).viewerLocalLabel;
  }, [zone, viewer, date, start, end]);
  const notifies =
    Boolean(editing) &&
    (date !== initial.date || start !== initial.start || end !== initial.end || loc !== initial.loc || locText !== initial.locText || arrive !== initial.arrive);

  async function submit() {
    setError(null);
    if (preview?.error) return setError(preview.error);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end))
      return setError('Choose a date and start and end times.');
    setBusy(true);
    try {
      const startsAt = zonedTimeToInstant(date, start, zone).toISOString();
      const endsAt = zonedTimeToInstant(date, end, zone).toISOString();
      let eventTitle = title.trim();
      if (isGame) {
        const name = opp === NEW ? oppName.trim() : (opps.find((o) => o.id === opp)?.name ?? '');
        if (!name) return setError('Choose or add the opponent.');
        eventTitle = name.slice(0, 120);
      }
      let locationId: string | null = loc && loc !== TYPED ? loc : null;
      let locationText: string | null = loc === TYPED ? (picked ? placeText(picked) : locText.trim() || null) : null;
      if (loc === TYPED && saveLoc && locationText) {
        const r = await addLocation(supabase, {
          team_id: teamId,
          ...(picked ? locationFromSelection(picked) : { name: locationText.slice(0, 100) }),
        });
        if (r.error) return setError(friendlyError(r.error));
        locationId = r.data?.id ?? null;
        locationText = null;
      }
      let opponentId: string | null = isGame && opp && opp !== NEW ? opp : null;
      if (isGame && opp === NEW && oppName.trim()) {
        const r = await addOpponent(supabase, teamId, oppName.trim());
        if (r.error) return setError(friendlyError(r.error));
        opponentId = r.data?.id ?? null;
      }
      const arriveN = arrive === '' ? null : Number(arrive);

      if (editing) {
        const patch: Record<string, unknown> = {};
        if (eventTitle !== editing.title) patch.title = eventTitle;
        if ((notes || null) !== (editing.notes ?? null)) patch.notes = notes || null;
        if ((editing.location_id ?? null) !== locationId || (editing.location_text ?? null) !== locationText) {
          patch.location_id = locationId;
          patch.location_text = locationText;
        }
        if (isGame) {
          if ((editing.opponent_id ?? null) !== opponentId) patch.opponent_id = opponentId;
          if ((editing.home_away ?? 'none') !== homeAway) patch.home_away = homeAway === 'none' ? null : homeAway;
        }
        if ((editing.arrive_early_minutes ?? null) !== arriveN) patch.arrive_early_minutes = arriveN;
        if (date !== initial.date || start !== initial.start || end !== initial.end) {
          if (multi) {
            if (start !== initial.start) patch.local_start_time = start;
            if (start !== initial.start || end !== initial.end) patch.duration_minutes = minutesBetween(startsAt, endsAt);
          } else {
            patch.starts_at = startsAt;
            patch.ends_at = endsAt;
          }
        }
        if (Object.keys(patch).length === 0) return setError('Nothing changed.');
        const res = await updateEvent(supabase, editing.id, isSeries ? scope : 'this', patch);
        if (res.error) return setError(friendlyError(res.error));
        onClose();
        onSaved(res.data && res.data > 1 ? `Updated ${res.data} events` : 'Event updated');
        return;
      }

      const input = {
        team_id: teamId,
        type,
        title: eventTitle,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: zone,
        location_id: locationId,
        location_text: locationText,
        opponent_id: opponentId,
        home_away: isGame && homeAway !== 'none' ? homeAway : null,
        notes: notes || null,
        arrive_early_minutes: arriveN,
        recurrence: repeat === 'weekly' ? { weekdays: days, interval: 1, count: Number(count) } : null,
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

  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollMax = Math.max(240, winH - insets.top - insets.bottom - space[4] * 2 - space[6] * 2 - 56);
  const heading = editing ? 'Edit event' : 'New event';

  return (
    <Sheet open onClose={onClose} title={heading}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space[6] }}
        style={{ maxHeight: scrollMax }}
      >
        <Text variant="heading">{heading}</Text>

        {isSeries ? (
          <View style={{ gap: space[2] }} accessibilityRole="radiogroup" accessibilityLabel="Apply to">
            {EDIT_SCOPES.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="radio"
                accessibilityState={{ selected: scope === s }}
                accessibilityLabel={EDIT_SCOPE_LABELS[s]}
                accessibilityHint={SCOPE_EFFECT[s]}
                onPress={() => setScope(s)}
                style={{
                  minHeight: componentTokens.minTarget,
                  gap: space[1],
                  padding: space[3],
                  borderRadius: radius.lg,
                  borderWidth: componentTokens.card.border,
                  borderColor: scope === s ? c.ink : c.line,
                  backgroundColor: scope === s ? c.surfaceAlt : c.surface,
                }}
              >
                <Text variant="bodyBold">{EDIT_SCOPE_LABELS[s]}</Text>
                <Text variant="caption" muted>
                  {SCOPE_EFFECT[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Section title="Basics">
          {!editing ? (
            <Choice label="Type" value={type} onChange={setType} options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))} />
          ) : null}
          {!isGame ? <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} /> : null}
        </Section>

        <Section title="When">
          {!multi ? <DatePicker label="Date" value={date} onChange={setDate} required yearSpan={{ before: 1, after: 3 }} /> : null}
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <TimePicker label="Starts" value={start} onChange={setStart} required />
            </View>
            <View style={{ flex: 1 }}>
              <TimePicker label="Ends" value={end} onChange={setEnd} required />
            </View>
          </View>
          <Text variant="caption" muted>
            Times are in {zone.replaceAll('_', ' ')}.{yourTime ? ` Your time: ${yourTime}.` : ''}
          </Text>
        </Section>

        <Section title="Where">
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
            <>
              <PlaceAutocomplete
                label="Place name or address"
                value={locText}
                verified={picked !== null}
                onChange={setLocText}
                onSelect={(p) => {
                  setPicked(p);
                  setLocText(p.formattedAddress);
                }}
                onClear={() => {
                  setPicked(null);
                  setLocText('');
                }}
              />
              <Chip label="Save this place" selected={saveLoc} onPress={() => setSaveLoc(!saveLoc)} />
            </>
          ) : null}
        </Section>

        {isGame ? (
          <Section title="Game details">
            <Choice
              label="Opponent"
              value={opp}
              onChange={setOpp}
              options={[{ value: NONE, label: 'None' }, ...opps.map((o) => ({ value: o.id, label: o.name })), { value: NEW, label: 'New opponent…' }]}
            />
            {opp === NEW ? <TextField label="Opponent name" value={oppName} onChangeText={setOppName} maxLength={100} /> : null}
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
          </Section>
        ) : null}

        <Section title="Arrive early and notes">
          <TextField label="Arrive early (minutes)" value={arrive} onChangeText={setArrive} keyboardType="number-pad" />
          <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
        </Section>

        {!editing ? (
          <Section title="Repeat">
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
                <View accessibilityLabel="Repeat on" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {DAYS.map((d) => (
                    <Chip
                      key={d.n}
                      label={d.l}
                      selected={days.includes(d.n)}
                      onPress={() => setDays(days.includes(d.n) ? days.filter((x) => x !== d.n) : [...days, d.n].sort())}
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
                <Text
                  variant="caption"
                  accessibilityLiveRegion="polite"
                  style={{ color: preview?.error ? c.bad : c.ink }}
                  testID="repeat-preview"
                >
                  {preview?.error ?? preview?.line}
                </Text>
              </>
            ) : null}
          </Section>
        ) : null}

        {editing ? (
          <Text variant="caption" muted={!notifies}>
            {notifies ? 'Families will be notified of this change.' : 'Title and notes changes are saved quietly. Nobody is notified.'}
          </Text>
        ) : null}
        <FormMessage error={error} />
        <Button
          title={editing ? 'Save changes' : 'Add to schedule'}
          onPress={submit}
          loading={busy}
          disabled={Boolean(preview?.error)}
          testID="save-event"
        />
      </ScrollView>
    </Sheet>
  );
}

'use client';

import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  MAX_SERIES_OCCURRENCES,
  createEventSchema,
  friendlyError,
  localDateKey,
  localTimeKey,
  zonedTimeToInstant,
  type EditScope,
  type EventType,
  type Sport,
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
import { useEffect, useMemo, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import {
  Button,
  Chip,
  SegmentedControl,
  Select,
  Sheet,
  Text,
  TextArea,
  DatePicker,
  TextField,
  TimePicker,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './schedule.module.css';
import { ScopePicker } from './scope-picker';
import { useViewerZone } from './use-viewer-zone';

const NONE = '';
const TYPED = '__typed';
const NEW = '__new';
const DAYS = [
  { n: 1, l: 'Mon' },
  { n: 2, l: 'Tue' },
  { n: 3, l: 'Wed' },
  { n: 4, l: 'Thu' },
  { n: 5, l: 'Fri' },
  { n: 6, l: 'Sat' },
  { n: 7, l: 'Sun' },
] as const;

function allZones(first: string): string[] {
  const list =
    (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    ) ?? [];
  return [first, ...list.filter((z) => z !== first)];
}
const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);

/**
 * New / edit event. One screen, one primary action. Editing a series event asks for the scope
 * first ("This event / This and following / All events"); time changes across a series are sent
 * as a local time and a length so every occurrence keeps its wall-clock time across DST.
 */
export function EventForm(props: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  sport?: Sport;
  editing?: EventDetail;
  onSaved: (message: string) => void;
}) {
  // Mounted only while open, so every opening starts from the event's current values.
  return props.open ? <EventFormBody {...props} /> : null;
}

function EventFormBody({
  open,
  onClose,
  teamId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  sport?: Sport;
  editing?: EventDetail;
  onSaved: (message: string) => void;
}) {
  const viewerZone = useViewerZone() ?? 'UTC';
  const zone0 = editing?.timezone ?? viewerZone;
  const initial = useMemo(() => {
    const today = localDateKey(new Date(), zone0);
    return {
      type: (editing?.type as EventType) ?? 'practice',
      title: editing?.title ?? '',
      date: editing ? localDateKey(editing.starts_at, editing.timezone) : today,
      start: editing ? localTimeKey(editing.starts_at, editing.timezone) : '17:30',
      end: editing ? localTimeKey(editing.ends_at, editing.timezone) : '19:00',
      timezone: zone0,
      loc: editing ? (editing.location_id ?? (editing.location_text ? TYPED : NONE)) : NONE,
      locText: editing?.location_text ?? '',
      opp: editing?.opponent_id ?? NONE,
      homeAway: (editing?.home_away ?? '') as '' | 'home' | 'away' | 'neutral',
      arrive: editing?.arrive_early_minutes?.toString() ?? '',
      notes: editing?.notes ?? '',
    };
  }, [editing, zone0]);

  const [f, setF] = useState(initial);
  const [scope, setScope] = useState<EditScope>('this');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [saveLoc, setSaveLoc] = useState(false);
  const [newOpp, setNewOpp] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<'count' | 'until'>('count');
  const [count, setCount] = useState('8');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([getLocations(getClient(), teamId), getOpponents(getClient(), teamId)]).then(
      ([l, o]) => {
        if (!live) return;
        setLocations(l.data ?? []);
        setOpponents(o.data ?? []);
      },
    );
    return () => {
      live = false;
    };
  }, [open, initial, teamId]);

  const isSeries = Boolean(editing?.series_id);
  const multi = isSeries && scope !== 'this';
  const isGame = f.type === 'game';
  const zones = useMemo(() => allZones(zone0), [zone0]);

  async function submit() {
    setError(null);
    const client = getClient();
    const startsAt = zonedTimeToInstant(f.date, f.start, f.timezone).toISOString();
    const endsAt = zonedTimeToInstant(f.date, f.end, f.timezone).toISOString();

    setBusy(true);
    try {
      // Saved location / opponent first, so the event can reference them.
      let locationId: string | null = f.loc && f.loc !== TYPED ? f.loc : null;
      let locationText: string | null = f.loc === TYPED ? f.locText.trim() || null : null;
      if (f.loc === TYPED && saveLoc && locationText) {
        const r = await addLocation(client, { team_id: teamId, name: locationText });
        if (r.error) return setError(friendlyError(r.error));
        locationId = r.data?.id ?? null;
        locationText = null;
      }
      let opponentId: string | null = isGame && f.opp && f.opp !== NEW ? f.opp : null;
      if (isGame && f.opp === NEW && newOpp.trim()) {
        const r = await addOpponent(client, teamId, newOpp.trim());
        if (r.error) return setError(friendlyError(r.error));
        opponentId = r.data?.id ?? null;
      }

      if (editing) {
        const patch: Record<string, unknown> = {};
        if (f.title.trim() !== editing.title) patch.title = f.title.trim();
        if ((f.notes || null) !== (editing.notes ?? null)) patch.notes = f.notes || null;
        const locChanged =
          (editing.location_id ?? null) !== locationId ||
          (editing.location_text ?? null) !== locationText;
        if (locChanged) {
          patch.location_id = locationId;
          patch.location_text = locationText;
        }
        if (isGame) {
          if ((editing.opponent_id ?? null) !== opponentId) patch.opponent_id = opponentId;
          if ((editing.home_away ?? '') !== f.homeAway) patch.home_away = f.homeAway || null;
        }
        const arrive = f.arrive === '' ? null : Number(f.arrive);
        if ((editing.arrive_early_minutes ?? null) !== arrive) patch.arrive_early_minutes = arrive;
        const timeChanged =
          f.date !== initial.date ||
          f.start !== initial.start ||
          f.end !== initial.end ||
          f.timezone !== initial.timezone;
        if (timeChanged) {
          if (multi) {
            if (f.start !== initial.start) patch.local_start_time = f.start;
            if (f.start !== initial.start || f.end !== initial.end)
              patch.duration_minutes = minutesBetween(startsAt, endsAt);
          } else {
            patch.starts_at = startsAt;
            patch.ends_at = endsAt;
            if (f.timezone !== initial.timezone) patch.timezone = f.timezone;
          }
        }
        if (Object.keys(patch).length === 0) return setError('Nothing changed.');
        const res = await updateEvent(client, editing.id, isSeries ? scope : 'this', patch);
        if (res.error) return setError(friendlyError(res.error));
        onClose();
        onSaved(res.data && res.data > 1 ? `Updated ${res.data} events` : 'Event updated');
        return;
      }

      const input = {
        team_id: teamId,
        type: f.type,
        title: f.title,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: f.timezone,
        location_id: locationId,
        location_text: locationText,
        opponent_id: opponentId,
        home_away: isGame && f.homeAway ? f.homeAway : null,
        notes: f.notes || null,
        arrive_early_minutes: f.arrive === '' ? null : Number(f.arrive),
        recurrence: repeat
          ? {
              weekdays: days,
              interval: 1,
              ...(endMode === 'count' ? { count: Number(count) } : { until }),
            }
          : null,
      };
      const parsed = createEventSchema.safeParse(input);
      if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the details.');
      const res = await createEvent(client, input);
      if (res.error) return setError(friendlyError(res.error));
      onClose();
      const n = res.data?.occurrences ?? 1;
      onSaved(n > 1 ? `${n} ${EVENT_TYPE_LABELS[f.type].toLowerCase()}s added` : 'Event added');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Edit event' : 'New event'}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Text variant="heading" as="h2">
          {editing ? 'Edit event' : 'New event'}
        </Text>
        {isSeries ? <ScopePicker value={scope} onChange={setScope} /> : null}
        {!editing ? (
          <SegmentedControl
            label="Type"
            value={f.type}
            onChange={(v) => set('type', v)}
            options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
          />
        ) : null}
        <TextField
          label="Title"
          value={f.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder={isGame ? 'Game vs. …' : 'Practice'}
          required
          maxLength={120}
        />
        {!multi ? (
          <DatePicker
            label="Date"
            value={f.date}
            onChange={(v) => set('date', v)}
            required
            yearSpan={{ before: 1, after: 3 }}
          />
        ) : null}
        <div className={styles.twoCols}>
          <TimePicker label="Starts" value={f.start} onChange={(v) => set('start', v)} required />
          <TimePicker label="Ends" value={f.end} onChange={(v) => set('end', v)} required />
        </div>
        {!multi ? (
          <Select
            label="Time zone"
            hint="Times are shown in this zone, with your local time when it differs."
            value={f.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            options={zones.map((z) => ({ value: z, label: z.replaceAll('_', ' ') }))}
          />
        ) : null}
        <Select
          label="Location"
          value={f.loc}
          onChange={(e) => set('loc', e.target.value)}
          options={[
            { value: NONE, label: 'No location' },
            ...locations.map((l) => ({ value: l.id, label: l.name })),
            { value: TYPED, label: 'Add a new place…' },
          ]}
        />
        {f.loc === TYPED ? (
          <>
            <TextField
              label="Place name or address"
              value={f.locText}
              onChange={(e) => set('locText', e.target.value)}
              maxLength={200}
            />
            {!editing ? (
              <div className={styles.chips}>
                <Chip selected={saveLoc} onClick={() => setSaveLoc(!saveLoc)}>
                  Save for next time
                </Chip>
              </div>
            ) : null}
          </>
        ) : null}
        {isGame ? (
          <>
            <Select
              label="Opponent"
              value={f.opp}
              onChange={(e) => set('opp', e.target.value)}
              options={[
                { value: NONE, label: 'No opponent' },
                ...opponents.map((o) => ({ value: o.id, label: o.name })),
                { value: NEW, label: 'Add a new opponent…' },
              ]}
            />
            {f.opp === NEW ? (
              <TextField
                label="Opponent name"
                value={newOpp}
                onChange={(e) => setNewOpp(e.target.value)}
                maxLength={100}
              />
            ) : null}
            <SegmentedControl
              label="Home or away"
              value={f.homeAway || 'none'}
              onChange={(v) => set('homeAway', v === 'none' ? '' : v)}
              options={[
                { value: 'none', label: 'Not set' },
                { value: 'home', label: 'Home' },
                { value: 'away', label: 'Away' },
              ]}
            />
          </>
        ) : null}
        <TextField
          label="Arrive early (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          max={240}
          value={f.arrive}
          onChange={(e) => set('arrive', e.target.value)}
        />
        <TextArea
          label="Notes"
          value={f.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={2000}
        />

        {!editing ? (
          <>
            <SegmentedControl
              label="Repeat"
              value={repeat ? 'weekly' : 'once'}
              onChange={(v) => setRepeat(v === 'weekly')}
              options={[
                { value: 'once', label: 'Doesn’t repeat' },
                { value: 'weekly', label: 'Weekly' },
              ]}
            />
            {repeat ? (
              <>
                <div className={styles.chips} role="group" aria-label="Repeat on">
                  {DAYS.map((d) => (
                    <Chip
                      key={d.n}
                      selected={days.includes(d.n)}
                      onClick={() =>
                        setDays(
                          days.includes(d.n)
                            ? days.filter((x) => x !== d.n)
                            : [...days, d.n].sort(),
                        )
                      }
                    >
                      {d.l}
                    </Chip>
                  ))}
                </div>
                <SegmentedControl
                  label="Ends"
                  value={endMode}
                  onChange={setEndMode}
                  options={[
                    { value: 'count', label: 'After a number' },
                    { value: 'until', label: 'On a date' },
                  ]}
                />
                {endMode === 'count' ? (
                  <TextField
                    label="Number of events"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_SERIES_OCCURRENCES}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    hint={`Up to ${MAX_SERIES_OCCURRENCES} events, within one year.`}
                  />
                ) : (
                  <DatePicker
                    label="Last date"
                    value={until}
                    onChange={setUntil}
                    yearSpan={{ before: 0, after: 3 }}
                  />
                )}
              </>
            ) : null}
          </>
        ) : null}

        <FormMessage error={error} />
        <Button type="submit" size="lg" loading={busy} data-testid="save-event">
          {editing ? 'Save changes' : 'Add to schedule'}
        </Button>
      </form>
    </Sheet>
  );
}

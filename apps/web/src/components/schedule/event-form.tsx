'use client';

import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  MAX_SERIES_OCCURRENCES,
  createEventSchema,
  friendlyError,
  describeEventTime,
  localDateKey,
  localTimeKey,
  previewRepeat,
  locationFromSelection,
  placeText,
  type PlaceSelection,
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
  PlaceAutocomplete,
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
      virtual: Boolean(editing?.virtual_url),
      url: editing?.virtual_url ?? '',
    };
  }, [editing, zone0]);

  const [f, setF] = useState(initial);
  const [scope, setScope] = useState<EditScope>('this');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [saveLoc, setSaveLoc] = useState(false);
  // A suggestion the user picked for "Add a new place…" (null when they only typed).
  const [picked, setPicked] = useState<PlaceSelection | null>(null);
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
  // Only a general "Event" can be virtual; games and practices are in person.
  const isVirtual = f.type === 'event' && f.virtual;
  const zones = useMemo(() => allZones(zone0), [zone0]);
  const preview = useMemo(
    () =>
      repeat && !editing
        ? previewRepeat({
            startDate: f.date,
            weekdays: days,
            ...(endMode === 'count' ? { count: Number(count) || 0 } : { until }),
            type: f.type,
          })
        : null,
    [repeat, editing, f.date, f.type, days, endMode, count, until],
  );
  const yourTime = useMemo(() => {
    if (f.timezone === viewerZone) return null;
    return describeEventTime(
      zonedTimeToInstant(f.date, f.start, f.timezone).toISOString(),
      zonedTimeToInstant(f.date, f.end, f.timezone).toISOString(),
      f.timezone,
      viewerZone,
    ).viewerLocalLabel;
  }, [f.date, f.start, f.end, f.timezone, viewerZone]);
  // Time, place and arrive-early edits notify families; title and notes edits are silent (the database decides).
  const notifies =
    Boolean(editing) &&
    (f.date !== initial.date ||
      f.start !== initial.start ||
      f.end !== initial.end ||
      f.timezone !== initial.timezone ||
      f.loc !== initial.loc ||
      f.locText !== initial.locText ||
      f.arrive !== initial.arrive ||
      f.url !== initial.url);

  async function submit() {
    setError(null);
    if (preview?.error) return setError(preview.error);
    const client = getClient();
    const startsAt = zonedTimeToInstant(f.date, f.start, f.timezone).toISOString();
    const endsAt = zonedTimeToInstant(f.date, f.end, f.timezone).toISOString();

    setBusy(true);
    try {
      const url = isVirtual ? f.url.trim() : '';
      if (isVirtual && !/^https?:\/\/\S+$/i.test(url))
        return setError('Enter the meeting link, starting with https://');
      // A game is titled by its opponent.
      let title = f.title.trim();
      if (isGame) {
        const oppName =
          f.opp === NEW ? newOpp.trim() : (opponents.find((o) => o.id === f.opp)?.name ?? '');
        if (!oppName) return setError('Choose or add the opponent.');
        title = oppName.slice(0, 120);
      }
      // Saved location / opponent first, so the event can reference them.
      let locationId: string | null = !isVirtual && f.loc && f.loc !== TYPED ? f.loc : null;
      let locationText: string | null =
        !isVirtual && f.loc === TYPED
          ? picked
            ? placeText(picked)
            : f.locText.trim() || null
          : null;
      if (!isVirtual && f.loc === TYPED && saveLoc && locationText) {
        // A picked place keeps its full address and coordinates; typed text saves as a name only.
        const r = await addLocation(client, {
          team_id: teamId,
          ...(picked ? locationFromSelection(picked) : { name: locationText.slice(0, 100) }),
        });
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
        if (title !== editing.title) patch.title = title;
        if ((url || null) !== (editing.virtual_url ?? null)) patch.virtual_url = url || null;
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
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: f.timezone,
        location_id: locationId,
        location_text: locationText,
        opponent_id: opponentId,
        home_away: isGame && f.homeAway ? f.homeAway : null,
        notes: f.notes || null,
        virtual_url: url || null,
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
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit event' : 'New event'}
      placement="right"
    >
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
        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Basics</legend>
        {!editing ? (
          <SegmentedControl
            label="Type"
            value={f.type}
            onChange={(v) => set('type', v)}
            options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
          />
        ) : null}
        {!isGame ? (
          <TextField
            label="Title"
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Practice"
            required
            maxLength={120}
          />
        ) : null}
        </fieldset>
        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>When</legend>
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
        {yourTime ? (
          <p className={styles.meta} data-testid="your-time">
            Your time: {yourTime}
          </p>
        ) : null}
        </fieldset>
        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Where</legend>
        {f.type === 'event' ? (
          <SegmentedControl
            label="In person or virtual"
            value={isVirtual ? 'virtual' : 'in_person'}
            onChange={(v) => set('virtual', v === 'virtual')}
            options={[
              { value: 'in_person', label: 'In person' },
              { value: 'virtual', label: 'Virtual' },
            ]}
          />
        ) : null}
        {isVirtual ? (
          <TextField
            label="Meeting link"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={f.url}
            onChange={(e) => set('url', e.target.value)}
            maxLength={500}
            required
          />
        ) : (
          <>
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
                <PlaceAutocomplete
                  label="Place name or address"
                  value={f.locText}
                  verified={picked !== null}
                  onChange={(text) => set('locText', text)}
                  onSelect={(p) => {
                    setPicked(p);
                    set('locText', p.formattedAddress);
                  }}
                  onClear={() => {
                    setPicked(null);
                    set('locText', '');
                  }}
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
          </>
        )}
        </fieldset>
        {isGame ? (
          <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Game details</legend>
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
          </fieldset>
        ) : null}
        <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Arrive early and notes</legend>
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
        </fieldset>

        {!editing ? (
          <fieldset className={styles.section}>
          <legend className={styles.sectionTitle}>Repeat</legend>
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
                <p
                  className={preview?.error ? styles.repeatError : styles.repeatLine}
                  role="status"
                  aria-live="polite"
                  data-testid="repeat-preview"
                >
                  {preview?.error ?? preview?.line}
                </p>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {notifies ? (
          <p className={styles.updated} data-testid="notify-note">
            Families will be notified of this change.
          </p>
        ) : editing ? (
          <p className={styles.meta}>Title and notes changes are saved quietly. Nobody is notified.</p>
        ) : null}
        <FormMessage error={error} />
        <Button type="submit" size="lg" loading={busy} disabled={Boolean(preview?.error)} data-testid="save-event">
          {editing ? 'Save changes' : 'Add to schedule'}
        </Button>
      </form>
    </Sheet>
  );
}

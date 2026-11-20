'use client';

import { RSVP_LABELS } from '@athleit/core';
import type { EventDetail, RsvpDetailRow, RsvpSummary } from '@athleit/db/scheduling';

import { EventDetailView } from '@/components/schedule/event-detail';
import { EventRow } from '@/components/schedule/event-row';
import type { ScheduleItem } from '@/components/schedule/items';
import { MonthGrid } from '@/components/schedule/month-grid';
import styles from '@/components/schedule/schedule.module.css';
import { ScopePicker } from '@/components/schedule/scope-picker';
import {
  Button,
  Chip,
  SegmentedControl,
  Select,
  Text,
  TextArea,
  TextField,
  TimePicker,
} from '@/components/ui';

// Fixed fixtures so the baselines never change with the clock. Placeholder names only.
const ZONE = 'America/New_York';
const item = (
  over: Partial<ScheduleItem> &
    Pick<ScheduleItem, 'id' | 'title' | 'type' | 'starts_at' | 'ends_at'>,
): ScheduleItem => ({
  team_id: 't',
  timezone: ZONE,
  location: 'Field 3, Riverside Park',
  status: 'scheduled',
  cancelled_reason: null,
  ...over,
});
const ROWS: ScheduleItem[] = [
  item({
    id: 'r1',
    title: 'Game vs. Hawks',
    type: 'game',
    starts_at: '2026-11-21T15:00:00Z',
    ends_at: '2026-11-21T17:00:00Z',
    opponent: 'Hawks',
    home_away: 'home',
    revision: 2,
    seen_revision: null,
    children: [
      { player_id: 'p1', first_name: 'Maya', status: null },
      { player_id: 'p2', first_name: 'Eli', status: 'going' },
    ],
  }),
  item({
    id: 'r2',
    title: 'Practice',
    type: 'practice',
    starts_at: '2026-11-24T22:30:00Z',
    ends_at: '2026-11-25T00:00:00Z',
    location: 'Gym B',
    series_id: 's1',
    counts: { going: 8, not_going: 1, maybe: 2, no_reply: 3 },
  }),
  item({
    id: 'r3',
    title: 'Team dinner',
    type: 'event',
    starts_at: '2026-11-27T23:00:00Z',
    ends_at: '2026-11-28T01:00:00Z',
    status: 'cancelled',
    cancelled_reason: 'Venue closed',
  }),
  item({
    id: 'r4',
    title: 'Game vs. Owls',
    type: 'game',
    starts_at: '2026-11-14T15:00:00Z',
    ends_at: '2026-11-14T17:00:00Z',
    result: { our: 3, their: 2, outcome: 'win' },
  }),
];
const noop = () => undefined;
/** Fixed clock so the rows never change with the day. */
const NOW = new Date('2026-11-20T12:00:00Z');

export function ScheduleRowsDemo() {
  return (
    <ul className={`${styles.list} ${styles.demoRows}`}>
      {ROWS.map((r, i) => (
        <EventRow key={r.id} item={r} now={NOW} selected={i === 1} showCounts={i === 1} onSelect={noop} />
      ))}
    </ul>
  );
}

export function MonthDemo() {
  const byDay = new Map<string, ScheduleItem[]>([
    ['2026-11-21', [ROWS[0]!]],
    ['2026-11-24', [ROWS[1]!]],
    ['2026-11-27', [ROWS[2]!]],
    ['2026-11-14', [ROWS[3]!]],
  ]);
  return (
    <MonthGrid
      year={2026}
      month={11}
      label="November 2026"
      today="2026-11-17"
      pickedDay="2026-11-24"
      itemsByDay={byDay}
      onPickDay={noop}
      onSelect={noop}
    />
  );
}

const EVENT = {
  id: 'e',
  team_id: 't',
  team_name: 'Falcons U12',
  sport: 'soccer',
  type: 'game',
  title: 'Game vs. Hawks',
  starts_at: '2026-11-21T15:00:00Z',
  ends_at: '2026-11-21T17:00:00Z',
  timezone: ZONE,
  location_id: null,
  location_name: 'Field 3, Riverside Park',
  location_address: '1 Riverside Dr',
  location_text: null,
  opponent_id: null,
  opponent_name: 'Hawks',
  home_away: 'home',
  notes: 'Bring water and both jerseys.',
  arrive_early_minutes: 30,
  status: 'scheduled',
  cancelled_reason: null,
  series_id: null,
  game_format: null,
  revision: 1,
  is_staff: false,
  our_score: null as unknown as number,
  their_score: null as unknown as number,
  outcome: null as unknown as string,
  period_scores: null,
  result_notes: null as unknown as string,
} as unknown as EventDetail;
const SUMMARY: RsvpSummary = { going: 11, not_going: 2, maybe: 1, no_reply: 5 };
const LIST: RsvpDetailRow[] = [
  ['Maya', 'Reyes', 'going'],
  ['Jonah', 'Park', 'going'],
  ['Priya', 'Nair', 'not_going'],
  ['Theo', 'Brandt', null],
  ['Lena', 'Okafor', 'maybe'],
  ['Sam', 'Ito', 'going'],
].map(([first_name, last_name, status], i) => ({
  player_id: `p${i}`,
  first_name: first_name!,
  last_name: last_name!,
  jersey_number: i + 3,
  status: status as string,
  note: i === 2 ? 'Family trip' : (null as unknown as string),
  responded_at: '2026-11-17T12:00:00Z',
  set_by_staff: false,
  responded_by_name: 'Parent',
}));

export function FamilyDetailDemo() {
  return (
    <div className={styles.demoDrawer}>
      <EventDetailView
        event={EVENT}
        summary={SUMMARY}
        detail={null}
        kids={[
          { player_id: 'a', first_name: 'Maya', status: 'going' },
          { player_id: 'b', first_name: 'Eli', status: null },
        ]}
        variant="page"
      />
    </div>
  );
}

export function StaffDetailDemo() {
  return (
    <div className={styles.demoDrawer}>
      <EventDetailView
        event={{ ...EVENT, is_staff: true }}
        summary={SUMMARY}
        detail={LIST}
        kids={[]}
        variant="drawer"
        onClose={noop}
        actions={{ onEdit: noop, onCancel: noop, onResult: noop }}
      />
    </div>
  );
}

export function CancelledDetailDemo() {
  return (
    <div className={styles.demoDrawer}>
      <EventDetailView
        event={{ ...EVENT, status: 'cancelled', cancelled_reason: 'Field closed for the weather' }}
        summary={SUMMARY}
        detail={null}
        kids={[]}
        variant="page"
        updated
      />
    </div>
  );
}

/** Form pieces from the new/edit event, scope and result flows, shown inline (the real ones open in a sheet). */
export function FlowPartsDemo() {
  return (
    <div className={styles.demoForm}>
      <Text variant="heading" as="h3">
        Which events?
      </Text>
      <ScopePicker value="this_and_following" onChange={noop} />
      <SegmentedControl
        label="Type"
        value="game"
        onChange={noop}
        options={[
          { value: 'practice', label: 'Practice' },
          { value: 'game', label: 'Game' },
          { value: 'event', label: 'Event' },
        ]}
      />
      <TextField label="Title" defaultValue="Game vs. Hawks" readOnly />
      <div className={styles.twoCols}>
        <TimePicker label="Starts" defaultValue="10:00" />
        <TimePicker label="Ends" defaultValue="12:00" />
      </div>
      <Select
        label="Location"
        defaultValue="a"
        options={[{ value: 'a', label: 'Field 3, Riverside Park' }]}
      />
      <div className={styles.chips}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
          <Chip key={d} selected={d === 'Tue' || d === 'Thu'}>
            {d}
          </Chip>
        ))}
      </div>
      <TextArea
        label="Reason (shown to families)"
        defaultValue="Field closed for the weather"
        readOnly
      />
      <div className={styles.scoreGrid}>
        <span className={styles.scoreLabel}>Half 1</span>
        <TextField label="Us" mono defaultValue="1" readOnly />
        <TextField label="Them" mono defaultValue="0" readOnly />
      </div>
      <div className={styles.pair}>
        <Button size="lg">{RSVP_LABELS.going}</Button>
        <Button size="lg" variant="secondary">
          {RSVP_LABELS.not_going}
        </Button>
      </div>
    </div>
  );
}

import {
  EVENT_TYPE_LABELS,
  NO_FILTERS,
  addDays,
  filterChips,
  hasActiveFilters,
  monthGrid,
  shortDate,
  weekDays,
  weekdayOf,
  type EventType,
  type ScheduleFilters,
} from '@athleit/core';
import { componentTokens, radius, space } from '@athleit/tokens';
import { Pressable, View } from 'react-native';

import { Choice } from '@/components/app/kit';
import { Button, Chip, Icon, Sheet, Text, useTheme } from '@/components/ui';

import type { ScheduleItem } from './items';

const TYPES: EventType[] = ['game', 'practice', 'event'];
const TYPE_ICON = { game: 'flag', practice: 'users-three', event: 'calendar-blank' } as const;

/** Removable chips for the active filters, with a Filters button. */
export function FilterRow({
  filters,
  onChange,
  onOpen,
  childName,
  teamName,
}: {
  filters: ScheduleFilters;
  onChange: (f: ScheduleFilters) => void;
  onOpen: () => void;
  childName: (id: string) => string | undefined;
  teamName: (id: string) => string | undefined;
}) {
  const chips = filterChips(filters, { child: childName, team: teamName });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
      <Button title="Filters" icon="funnel-simple" variant="secondary" onPress={onOpen} testID="schedule-filters" />
      {chips.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter: ${c.label}`}
          onPress={() => onChange(c.remove)}
          style={{ minHeight: componentTokens.minTarget, justifyContent: 'center' }}
        >
          <Chip label={`${c.label}  ×`} selected />
        </Pressable>
      ))}
      {hasActiveFilters(filters) ? <Button title="Clear" variant="ghost" onPress={() => onChange(NO_FILTERS)} /> : null}
    </View>
  );
}

/** Filter sheet: type for everyone; Needs reply, Child and Team for families. */
export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  family,
  children,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  filters: ScheduleFilters;
  onChange: (f: ScheduleFilters) => void;
  family: boolean;
  children: [string, string][];
  teams: [string, string][];
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      <View style={{ gap: space[4] }}>
        <Text variant="heading">Filters</Text>
        {family ? (
          <Choice
            label="Needs reply"
            value={filters.needsReply ? 'on' : 'off'}
            onChange={(v) => onChange({ ...filters, needsReply: v === 'on' })}
            options={[
              { value: 'off', label: 'All events' },
              { value: 'on', label: 'Needs reply' },
            ]}
          />
        ) : null}
        <View style={{ gap: space[2] }} accessibilityLabel="Type">
          <Text variant="caption">Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {TYPES.map((t) => (
              <Chip
                key={t}
                label={EVENT_TYPE_LABELS[t]}
                selected={filters.types.includes(t)}
                onPress={() =>
                  onChange({
                    ...filters,
                    types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t],
                  })
                }
              />
            ))}
          </View>
        </View>
        {family && children.length > 1 ? (
          <Choice
            label="Child"
            value={filters.childId ?? ''}
            onChange={(v) => onChange({ ...filters, childId: v || null })}
            options={[{ value: '', label: 'All children' }, ...children.map(([value, label]) => ({ value, label }))]}
          />
        ) : null}
        {family && teams.length > 1 ? (
          <Choice
            label="Team"
            value={filters.teamId ?? ''}
            onChange={(v) => onChange({ ...filters, teamId: v || null })}
            options={[{ value: '', label: 'All teams' }, ...teams.map(([value, label]) => ({ value, label }))]}
          />
        ) : null}
        <Button title="Done" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const ENTRIES = [
  { key: 'places', icon: 'map-pin', title: 'Places', body: 'Saved fields and gyms you can pick when adding events.' },
  { key: 'opponents', icon: 'flag', title: 'Opponents', body: 'Teams you play, so games take one tap to set up.' },
  { key: 'feed', icon: 'link', title: 'Calendar link', body: 'Show this schedule in Apple or Google Calendar.' },
] as const;

/** More sheet: Places and Opponents (staff) and Calendar link (everyone), each with one line of why. */
export function MoreSheet({
  open,
  onClose,
  canManage,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onChoose: (k: 'places' | 'opponents' | 'feed') => void;
}) {
  const { theme } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="More">
      <View style={{ gap: space[2] }}>
        <Text variant="heading">More</Text>
        {ENTRIES.filter((e) => canManage || e.key === 'feed').map((e) => (
          <Pressable
            key={e.key}
            accessibilityRole="button"
            accessibilityLabel={`${e.title}. ${e.body}`}
            onPress={() => {
              onClose();
              onChoose(e.key);
            }}
            style={{ flexDirection: 'row', gap: space[3], minHeight: componentTokens.minTarget, paddingVertical: space[2] }}
          >
            <Icon name={e.icon} color={theme.color.ink} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{e.title}</Text>
              <Text variant="caption" muted>
                {e.body}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** A horizontal week of days (Sunday start) with a dot where events are. Picking a day focuses the agenda on it. */
export function WeekStrip({
  anchor,
  today,
  picked,
  hasEvents,
  onPick,
  onShift,
}: {
  anchor: string;
  today: string;
  picked: string | null;
  hasEvents: (k: string) => boolean;
  onPick: (k: string | null) => void;
  onShift: (dir: -1 | 1) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const days = weekDays(anchor);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => onShift(-1)} style={{ minWidth: componentTokens.minTarget, minHeight: componentTokens.minTarget, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="caret-left" size="sm" />
      </Pressable>
      {days.map((k) => {
        const on = k === picked;
        const isToday = k === today;
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${shortDate(k)}${isToday ? ', today' : ''}${hasEvents(k) ? ', has events' : ''}`}
            onPress={() => onPick(on ? null : k)}
            style={{ flex: 1, minHeight: componentTokens.minTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: on ? c.bubbleOwn : 'transparent' }}
          >
            <Text variant="caption" style={{ color: on ? c.bubbleOwnInk : c.muted }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekdayOf(k)]}
            </Text>
            <View style={{ minWidth: space[6], alignItems: 'center', borderRadius: radius.pill, backgroundColor: isToday ? c.accent : 'transparent' }}>
              <Text variant="bodyBold" style={{ color: isToday ? c.accentInk : on ? c.bubbleOwnInk : c.ink }}>
                {Number(k.slice(8))}
              </Text>
            </View>
            <View style={{ width: space[1], height: space[1], borderRadius: radius.pill, backgroundColor: hasEvents(k) ? (on ? c.bubbleOwnInk : c.muted) : 'transparent' }} />
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="Next week" onPress={() => onShift(1)} style={{ minWidth: componentTokens.minTarget, minHeight: componentTokens.minTarget, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="caret-right" size="sm" />
      </Pressable>
    </View>
  );
}

/** Compact month: today in lime, an icon per event type with a count, tapping a day selects it. */
export function MonthView({
  year,
  month,
  today,
  picked,
  itemsByDay,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  picked: string | null;
  itemsByDay: ReadonlyMap<string, ScheduleItem[]>;
  onPick: (k: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return (
    <View style={{ gap: space[1] }} accessibilityLabel="Month">
      <View style={{ flexDirection: 'row' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} variant="caption" muted style={{ flex: 1, textAlign: 'center' }}>
            {d}
          </Text>
        ))}
      </View>
      {monthGrid(year, month).map((week) => (
        <View key={week[0]} style={{ flexDirection: 'row', gap: space[1] }}>
          {week.map((k) => {
            const items = (itemsByDay.get(k) ?? []).filter((i) => i.status !== 'cancelled');
            const isToday = k === today;
            const on = k === picked;
            const types = (['game', 'practice', 'event'] as const).map((t) => [t, items.filter((i) => i.type === t).length] as const).filter(([, n]) => n > 0);
            const spoken = types.map(([t, n]) => `${n} ${EVENT_TYPE_LABELS[t].toLowerCase()}${n === 1 ? '' : 's'}`).join(', ');
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${shortDate(k)}${isToday ? ', today' : ''}${spoken ? `, ${spoken}` : ', no events'}`}
                onPress={() => onPick(k)}
                style={{ flex: 1, minHeight: componentTokens.minTarget + space[3], alignItems: 'center', gap: space[1], paddingVertical: space[1], borderRadius: radius.md, backgroundColor: on ? c.surfaceAlt : 'transparent', opacity: k.slice(0, 7) === prefix ? 1 : 0.4 }}
              >
                <View style={{ minWidth: space[6], alignItems: 'center', borderRadius: radius.pill, backgroundColor: isToday ? c.accent : 'transparent' }}>
                  <Text variant="caption" style={{ color: isToday ? c.accentInk : c.ink }}>
                    {Number(k.slice(8))}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[1] }}>
                  {types.map(([t, n]) => (
                    <View key={t} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name={TYPE_ICON[t]} size="sm" color={c.muted} />
                      <Text variant="caption" muted>
                        {n}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export { addDays };

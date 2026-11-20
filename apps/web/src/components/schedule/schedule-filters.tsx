'use client';

import {
  EVENT_TYPE_LABELS,
  filterChips,
  hasActiveFilters,
  NO_FILTERS,
  type EventType,
  type ScheduleFilters,
} from '@athleit/core';
import { useMemo } from 'react';

import { Chip, Icon, Select } from '@/components/ui';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';

const TYPES: EventType[] = ['game', 'practice', 'event'];

/**
 * Type (everyone), Child and Team (households with several), Needs reply (families), as toggles, plus the active
 * filters as removable chips. `items` is whatever is loaded, used only to offer the children and teams that exist.
 */
export function ScheduleFilterBar({
  filters,
  onChange,
  items,
  family,
}: {
  filters: ScheduleFilters;
  onChange: (f: ScheduleFilters) => void;
  items: readonly ScheduleItem[];
  /** A household or a player: Needs reply, Child and Team make sense. */
  family: boolean;
}) {
  const { children, teams } = useMemo(() => {
    const kids = new Map<string, string>();
    const ts = new Map<string, string>();
    for (const it of items) {
      for (const c of it.children ?? []) kids.set(c.player_id, c.first_name);
      if (it.team_name) ts.set(it.team_id, it.team_name);
    }
    return { children: kids, teams: ts };
  }, [items]);

  const chips = filterChips(filters, {
    child: (id) => children.get(id),
    team: (id) => teams.get(id),
  });
  const toggleType = (t: EventType) =>
    onChange({
      ...filters,
      types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t],
    });

  return (
    <div className={styles.filterBar} data-testid="schedule-filters">
      <div className={styles.filterRow} role="group" aria-label="Filter events">
        <Icon name="funnel-simple" size="sm" />
        {family ? (
          <Chip
            selected={filters.needsReply}
            onClick={() => onChange({ ...filters, needsReply: !filters.needsReply })}
          >
            Needs reply
          </Chip>
        ) : null}
        {TYPES.map((t) => (
          <Chip key={t} selected={filters.types.includes(t)} onClick={() => toggleType(t)}>
            {EVENT_TYPE_LABELS[t]}
          </Chip>
        ))}
        {family && children.size > 1 ? (
          <Select
            label="Child"
            className={styles.filterSelect}
            value={filters.childId ?? ''}
            onChange={(e) => onChange({ ...filters, childId: e.target.value || null })}
            options={[
              { value: '', label: 'All children' },
              ...[...children].map(([value, label]) => ({ value, label })),
            ]}
          />
        ) : null}
        {family && teams.size > 1 ? (
          <Select
            label="Team"
            className={styles.filterSelect}
            value={filters.teamId ?? ''}
            onChange={(e) => onChange({ ...filters, teamId: e.target.value || null })}
            options={[
              { value: '', label: 'All teams' },
              ...[...teams].map(([value, label]) => ({ value, label })),
            ]}
          />
        ) : null}
      </div>
      {hasActiveFilters(filters) ? (
        <div className={styles.filterRow} aria-label="Active filters">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={styles.activeChip}
              onClick={() => onChange(c.remove)}
              aria-label={`Remove filter: ${c.label}`}
            >
              {c.label} <Icon name="x" size="sm" />
            </button>
          ))}
          <button type="button" className={styles.clearLink} onClick={() => onChange(NO_FILTERS)}>
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

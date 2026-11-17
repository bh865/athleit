'use client';

import { EDIT_SCOPES, EDIT_SCOPE_LABELS, type EditScope } from '@athleit/core';

import { SegmentedControl } from '@/components/ui';

/** "This event / This and following / All events", shown only for events that belong to a series. */
export function ScopePicker({
  value,
  onChange,
}: {
  value: EditScope;
  onChange: (v: EditScope) => void;
}) {
  return (
    <SegmentedControl
      label="Apply to"
      value={value}
      onChange={onChange}
      options={EDIT_SCOPES.map((s) => ({ value: s, label: EDIT_SCOPE_LABELS[s] }))}
    />
  );
}

'use client';

import { SegmentedControl } from './segmented-control';
import { useTheme } from './theme-provider';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <SegmentedControl
      label="Theme"
      value={mode}
      options={OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      onChange={setMode}
    />
  );
}

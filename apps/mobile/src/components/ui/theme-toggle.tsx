import { SegmentedControl } from './segmented-control';
import { useTheme } from './theme';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return <SegmentedControl label="Theme" value={mode} options={OPTIONS} onChange={setMode} />;
}

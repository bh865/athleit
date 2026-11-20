'use client';

import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { createTheme, ThemeProvider } from '@mui/material/styles';

import styles from './chart.module.css';

/**
 * The only file that imports MUI. Loaded with next/dynamic (ssr: false) from chart.tsx, and only under /admin, so none
 * of MUI or emotion reaches the public app bundle. The theme is scoped to the chart tree (no CssBaseline, no global
 * styles) and takes every colour from the Athleit CSS variables, so light and dark follow the page.
 */
export interface ChartSeries {
  id: string;
  label: string;
  data: number[];
  /** Dash pattern for line series so series differ by more than colour. */
  dash?: string;
  /** Previous-period comparison series is drawn dashed and muted. */
  compare?: boolean;
}
export type ChartKind = 'bar' | 'stacked' | 'line' | 'hbar' | 'spark';

const theme = createTheme({
  palette: { text: { primary: 'var(--color-ink)', secondary: 'var(--color-muted)' } },
});
// Distinct fills: ink, accent-pressed, ok, warn, bad, muted. Never colour alone (see the table and direct labels).
const COLORS = ['var(--color-ink)', 'var(--color-accent-pressed)', 'var(--color-ok)', 'var(--color-warn)', 'var(--color-bad)', 'var(--color-muted)'];
const HEIGHT = 240;
const SPARK = 40;

export default function ChartImpl({ kind, labels, series, ariaLabel }: { kind: ChartKind; labels: string[]; series: ChartSeries[]; ariaLabel: string }) {
  const colors = series.map((s, i) => (s.compare ? 'var(--color-muted)' : COLORS[i % COLORS.length]!));
  const xAxis = [{ scaleType: 'band' as const, data: labels }];
  return (
    <ThemeProvider theme={theme}>
      <div role="img" aria-label={ariaLabel} className={styles.plot}>
        {kind === 'spark' ? (
          <SparkLineChart data={series[0]?.data ?? []} height={SPARK} color="var(--color-ink)" />
        ) : kind === 'line' ? (
          <LineChart
            height={HEIGHT}
            colors={colors}
            xAxis={[{ scaleType: 'point', data: labels }]}
            series={series.map((s) => ({ id: s.id, label: s.label, data: s.data, showMark: true, curve: 'linear' as const }))}
            sx={Object.fromEntries(series.map((s, i) => [`& .MuiLineElement-series-${s.id}`, { strokeDasharray: s.compare ? '4 4' : (s.dash ?? (i % 2 ? '8 3' : 'none')) }]))}
          />
        ) : (
          <BarChart
            height={HEIGHT}
            colors={colors}
            layout={kind === 'hbar' ? 'horizontal' : 'vertical'}
            {...(kind === 'hbar'
              ? { yAxis: xAxis, xAxis: [{}] }
              : { xAxis })}
            series={series.map((s) => ({ id: s.id, label: s.label, data: s.data, ...(kind === 'stacked' ? { stack: 'total' } : {}) }))}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

'use client';

import { toCsv } from '@athleit/core';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useId, useState } from 'react';

import { Button, LoadingSkeleton, Text } from '@/components/ui';

import type { ChartKind, ChartSeries } from './chart-impl';
import styles from './chart.module.css';

// MUI is loaded here and nowhere else, client side only, so it never reaches the public app bundle.
const ChartImpl = dynamic(() => import('./chart-impl'), { ssr: false, loading: () => <LoadingSkeleton /> });

export type { ChartKind, ChartSeries };
export interface RangeOption {
  value: string;
  label: string;
  href: string;
  active: boolean;
}

/**
 * Chart card: title and source, range links (URL state), compare toggle, View as table, CSV export, and four states
 * (loading while the chart code loads, empty, error with retry, content). The table is the screen reader alternative and
 * the CSV is built from the very same rows, with the as-of time.
 */
export function ChartCard({
  title, source, asOf, kind, labels, series, ranges, compareHref, compareOn, state = 'ok', retryHref, money,
}: {
  title: string;
  source: string;
  asOf: string;
  kind: ChartKind;
  labels: string[];
  series: ChartSeries[];
  ranges?: RangeOption[];
  compareHref?: string;
  compareOn?: boolean;
  state?: 'ok' | 'error';
  retryHref?: string;
  /** Series values are integer cents: shown as dollars in the table and CSV. */
  money?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  const tableId = useId();
  const empty = state === 'ok' && (labels.length === 0 || series.every((s) => s.data.every((v) => v === 0)));
  const rows = labels.map((l, i) => ({ label: l, values: series.map((s) => s.data[i] ?? 0) }));

  function exportCsv() {
    const csv = toCsv(rows, [
      { header: 'Period', value: (r) => r.label },
      ...series.map((s, i) => ({ header: s.label, value: (r: (typeof rows)[number]) => r.values[i], ...(money ? { cents: true } : {}) })),
    ], new Date(asOf).toUTCString());
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const fmt = (v: number) => (money ? (v / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : v.toLocaleString('en-US'));

  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.head}>
        <div>
          <Text variant="heading" as="h2">{title}</Text>
          <code className={styles.source}>{source}</code>
        </div>
        <div className={styles.tools}>
          {ranges?.map((r) => (
            <Link key={r.value} href={r.href} className={`${styles.range} ${r.active ? styles.on : ''}`} aria-current={r.active ? 'true' : undefined} scroll={false}>{r.label}</Link>
          ))}
          {compareHref ? <Link href={compareHref} className={`${styles.range} ${compareOn ? styles.on : ''}`} aria-pressed={compareOn} scroll={false}>Compare</Link> : null}
          <Button variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} aria-controls={tableId}>View as table</Button>
          <Button variant="ghost" onClick={exportCsv} disabled={state !== 'ok' || empty}>Export CSV</Button>
        </div>
      </header>
      {state === 'error' ? (
        <div className={styles.note} role="alert">
          <Text variant="body">Couldn’t load this chart. Nothing was changed. The other charts are fine.</Text>
          {retryHref ? <Link href={retryHref}>Try again</Link> : null}
        </div>
      ) : empty ? (
        <div className={styles.note}><Text variant="body" muted>No data in this range. Try 30 days.</Text></div>
      ) : (
        <>
          {!asTable ? <ChartImpl kind={kind} labels={labels} series={series} ariaLabel={`${title}. Use View as table for the values.`} /> : null}
          {!asTable && series.length > 1 ? (
            <ul className={styles.legend}>{series.map((s) => <li key={s.id}>{s.label}</li>)}</ul>
          ) : null}
          <div id={tableId} hidden={!asTable}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>{title}, values by period</caption>
              <thead><tr><th scope="col">Period</th>{series.map((s) => <th key={s.id} scope="col" className={styles.num}>{s.label}</th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v, i) => <td key={i} className={styles.num}>{fmt(v)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      <footer className={styles.foot}>As of {new Date(asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</footer>
    </section>
  );
}

/** KPI sparkline: a tiny line with no axes. The tile around it carries the screen reader text. */
export function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  return <ChartImpl kind="spark" labels={data.map((_, i) => String(i))} series={[{ id: 'spark', label: 'Trend', data }]} ariaLabel="Trend" />;
}

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Text } from '@/components/ui';

import styles from './kit.module.css';

// Status pill: a shape AND a word, never colour alone ---------------------------------------------------------------
export type PillTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';
const SHAPE: Record<PillTone, string> = { ok: '●', warn: '▲', bad: '■', neutral: '○', info: '◆' };
export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      <span aria-hidden className={styles.shape}>
        {SHAPE[tone]}
      </span>
      {children}
    </span>
  );
}
const BILLING_TONE: Record<string, [PillTone, string]> = {
  off: ['neutral', 'Off'],
  trialing: ['info', 'Trialing'],
  active: ['ok', 'Active'],
  cancel_scheduled: ['warn', 'Cancel scheduled'],
  past_due: ['bad', 'Past due'],
  trial_expired: ['bad', 'Trial expired'],
  lapsed: ['bad', 'Lapsed'],
  comped: ['info', 'Comped'],
};
export function BillingPill({ state }: { state: string }) {
  const [tone, label] = BILLING_TONE[state] ?? ['neutral', state];
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
export const billingLabel = (state: string) => BILLING_TONE[state]?.[1] ?? state;

// Page scaffolding ---------------------------------------------------------------------------------------------------
export function PageTitle({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageTitle}>
      <div>
        <Text variant="title" as="h1">
          {title}
        </Text>
        {sub ? (
          <Text variant="body" muted as="p">
            {sub}
          </Text>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
export function Panel({
  title,
  source,
  children,
  aside,
}: {
  title?: string;
  source?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      {title ? (
        <header className={styles.panelHead}>
          <Text variant="heading" as="h2">
            {title}
          </Text>
          {source ? <code className={styles.source}>{source}</code> : null}
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}
export const Crumbs = ({ items }: { items: { label: string; href?: string }[] }) => (
  <nav aria-label="Breadcrumb" className={styles.crumbs}>
    {items.map((c, i) => (
      <span key={c.label}>
        {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        {i < items.length - 1 ? ' / ' : ''}
      </span>
    ))}
  </nav>
);

export const TileGrid = ({ children }: { children: ReactNode }) => (
  <div className={styles.tileGrid}>{children}</div>
);
export const ChartGrid = ({ children }: { children: ReactNode }) => (
  <div className={styles.chartGrid}>{children}</div>
);
export const Cluster = ({ children }: { children: ReactNode }) => (
  <div className={styles.cluster}>{children}</div>
);

// Key-value panel ----------------------------------------------------------------------------------------------------
export function KeyValue({
  rows,
}: {
  rows: readonly { k: string; v: ReactNode; mono?: boolean }[];
}) {
  return (
    <dl className={styles.kv}>
      {rows.map((r) => (
        <div key={r.k} className={styles.kvRow}>
          <dt>{r.k}</dt>
          <dd className={r.mono ? styles.mono : undefined}>{r.v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// Timeline -----------------------------------------------------------------------------------------------------------
export function Timeline({
  items,
  empty = 'Nothing yet.',
}: {
  items: readonly { title: string; meta: string; body?: ReactNode }[];
  empty?: string;
}) {
  if (items.length === 0)
    return (
      <Text variant="body" muted as="p">
        {empty}
      </Text>
    );
  return (
    <ol className={styles.timeline}>
      {items.map((i, n) => (
        <li key={n}>
          <span className={styles.dot} aria-hidden />
          <div>
            <strong>{i.title}</strong>
            <div className={styles.meta}>{i.meta}</div>
            {i.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

// Stat tile (a sparkline, when given, is rendered by the client chart wrapper and passed as children) -------------
export function StatTile({
  label,
  value,
  sr,
  sub,
  href,
  spark,
}: {
  label: string;
  value: string;
  sr?: string;
  sub?: string;
  href?: string;
  spark?: ReactNode;
}) {
  const body = (
    <>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {sub ? <span className={styles.tileSub}>{sub}</span> : null}
      {spark ? <span className={styles.spark}>{spark}</span> : null}
      {sr ? <span className={styles.srOnly}>{sr}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={styles.tile} aria-label={sr}>
      {body}
    </Link>
  ) : (
    <div className={styles.tile} role="group" aria-label={sr}>
      {body}
    </div>
  );
}

// Diff view: changed keys side by side, with a raw JSON toggle (details element: no client JS) -----------------------
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown) =>
  v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v);
export function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]),
  );
  return (
    <div className={styles.diff}>
      {keys.length === 0 ? (
        <Text variant="body" muted as="p">
          No field changes recorded.
        </Text>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className={styles.del}>
                  <span aria-hidden>− </span>
                  {show(b[k])}
                </td>
                <td className={styles.ins}>
                  <span aria-hidden>+ </span>
                  {show(a[k])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details>
        <summary>Raw</summary>
        <pre>{JSON.stringify({ before, after }, null, 2)}</pre>
      </details>
    </div>
  );
}

// Data table: server rendered. Sorting and paging are links (state in the URL); sticky header; density by class. ----
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** If set, the header is a sort link to ?sort=<key>. */
  sortable?: boolean;
  align?: 'right';
}
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowHref,
  sort,
  dir,
  buildHref,
  nextCursor,
  density = 'comfortable',
  empty,
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (r: T) => string;
  rowHref?: (r: T) => string;
  sort?: string;
  dir?: 'asc' | 'desc';
  /** Build a URL for the same page with these query changes (sort, dir, cursor, density). */
  buildHref: (q: Record<string, string | null>) => string;
  nextCursor?: string | null;
  density?: 'comfortable' | 'dense';
  empty?: ReactNode;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${density === 'dense' ? styles.dense : ''}`}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort === c.key;
              const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === 'right' ? styles.right : undefined}
                  aria-sort={
                    active
                      ? dir === 'desc'
                        ? 'descending'
                        : 'ascending'
                      : c.sortable
                        ? 'none'
                        : undefined
                  }
                >
                  {c.sortable ? (
                    <Link href={buildHref({ sort: c.key, dir: nextDir, cursor: null })}>
                      {c.header}
                      {active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </Link>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? 'Nothing here.'}</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === 'right' ? styles.right : undefined}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(r)} className={styles.rowLink}>
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className={styles.pager}>
        <Link href={buildHref({ density: density === 'dense' ? null : 'dense' })}>
          {density === 'dense' ? 'Comfortable rows' : 'Dense rows'}
        </Link>
        {nextCursor ? (
          <Link href={buildHref({ cursor: nextCursor })} rel="next">
            Next page
          </Link>
        ) : (
          <span className={styles.meta}>End of list</span>
        )}
      </div>
    </div>
  );
}

/** Opaque URL cursor for keyset pagination. */
export const encodeCursor = (c: unknown): string | null =>
  c ? Buffer.from(JSON.stringify(c)).toString('base64url') : null;
export function decodeCursor(s: string | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(s, 'base64url').toString());
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** Build a same-path URL, merging query changes (null removes a key). */
export function hrefBuilder(path: string, current: Record<string, string | string[] | undefined>) {
  return (q: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) if (typeof v === 'string') p.set(k, v);
    for (const [k, v] of Object.entries(q)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
}

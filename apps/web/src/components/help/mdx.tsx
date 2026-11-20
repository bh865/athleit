// The article component vocabulary (see docs/help-content.md). Server components: no client JS in an article body.
import { resolveLive, whoCanDo, type Capability, type LiveKey } from '@athleit/core';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { getHelpValues } from '@/lib/help/values';

import styles from './help.module.css';

export function Steps({ children }: { children: ReactNode }) {
  return <div className={styles.steps}>{children}</div>;
}

const CALLOUT_LABEL = { note: 'Note', warning: 'Warning', tip: 'Tip' } as const;
/** Status is never by colour alone: each kind has a word. */
export function Callout({
  kind = 'note',
  children,
}: {
  kind?: keyof typeof CALLOUT_LABEL;
  children: ReactNode;
}) {
  return (
    <aside className={styles.callout} role={kind === 'warning' ? 'note' : undefined}>
      <strong>{CALLOUT_LABEL[kind]}</strong>
      <div>{children}</div>
    </aside>
  );
}

export function WhoCanDo({ capability, label }: { capability: Capability; label?: string }) {
  const rows = whoCanDo(capability);
  return (
    <table className={styles.table}>
      <caption className={styles.muted}>Who can do this{label ? `: ${label}` : ''}</caption>
      <thead>
        <tr>
          <th scope="col">Role</th>
          <th scope="col">Can do this</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{r.allowed ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A figure filled from settings at render time. Never typed into an article. */
export async function Live({ value, amount }: { value: LiveKey; amount?: number }) {
  const r = resolveLive(value, await getHelpValues(), { amount });
  if (!r) return <span className={styles.muted}>(unavailable)</span>;
  return (
    <span
      className={styles.live}
      title="This updates automatically"
      data-live={value}
      data-billing-off={r.billingOff || undefined}
    >
      {r.text}
    </span>
  );
}

export function PlatformTabs({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
const PLATFORM = { web: 'On the web', ios: 'On iPhone', android: 'On Android' } as const;
export function Tab({
  platform,
  children,
}: {
  platform: keyof typeof PLATFORM;
  children: ReactNode;
}) {
  return (
    <section aria-label={PLATFORM[platform]}>
      <h3>{PLATFORM[platform]}</h3>
      {children}
    </section>
  );
}

export function Screenshot({
  src,
  alt,
  caption,
  width = 720,
  height = 480,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      {caption ? <figcaption className={styles.muted}>{caption}</figcaption> : null}
    </figure>
  );
}

export function FAQ({ children }: { children: ReactNode }) {
  return <div className={styles.faq}>{children}</div>;
}
export function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <div>{children}</div>
    </details>
  );
}

export function VersionNote({ since, children }: { since: string; children: ReactNode }) {
  return (
    <Callout kind="note">
      <span className={styles.mono}>App version {since} or later.</span> {children}
    </Callout>
  );
}

export const mdxComponents = {
  Steps,
  Callout,
  WhoCanDo,
  Live,
  PlatformTabs,
  Tab,
  Screenshot,
  FAQ,
  Q,
  VersionNote,
};

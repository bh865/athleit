'use client';

import { modulesFor, type PlatformRole } from '@athleit/core';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { lookupAction } from '@/app/admin/actions';
import { Icon, Sheet, Text } from '@/components/ui';

import styles from './command-palette.module.css';

interface Hit { type: string; id: string; label: string; via?: string }
const ROUTE: Record<string, (id: string) => string> = {
  team: (id) => `/admin/teams/${id}`, club: (id) => `/admin/clubs/${id}`, person: (id) => `/admin/people/${id}`,
  payment: () => '/admin/payments', connect: () => '/admin/connect', webhook_event: () => '/admin/jobs', household: () => '/admin/people',
};

/** ⌘K: jump to a module (from the registry) or look up an id or code. Money-related ids come back restricted for support. */
export function CommandPalette({ role }: { role: PlatformRole }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onChange(v: string) {
    setQ(v);
    const n = ++seq.current;
    if (v.trim().length < 3) { setHits([]); setRestricted(false); setNote(null); return; }
    window.setTimeout(async () => {
      if (n !== seq.current) return;
      const r = await lookupAction(v.trim());
      if (n !== seq.current) return;
      if (!r.ok) { setHits([]); setNote('Couldn’t look that up. Nothing was changed.'); return; }
      setRestricted(r.data.restricted);
      setNote(r.data.rate_limited ? 'You’re searching too fast. Wait a minute and try again.' : null);
      setHits(r.data.items.map((i) => ({ type: i.type, id: i.id, label: i.label, via: typeof i.via === 'string' ? i.via : undefined })) as Hit[]);
    }, 250);
  }
  const mods = q.trim() ? modulesFor(role).filter((m) => m.label.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const close = () => { setOpen(false); setQ(''); setHits([]); setRestricted(false); setNote(null); };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Search teams, people and ids" aria-keyshortcuts="Meta+K Control+K">
        <Icon name="magnifying-glass" size="sm" />
        <span>Search teams, people, PR-, RCP-, cus_…</span>
        <kbd>⌘K</kbd>
      </button>
      <Sheet open={open} onClose={close} title="Search" level="modal">
        <div className={styles.body}>
          <input className={styles.input} autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder="Team, person, pi_, in_, acct_, cus_, sub_, evt_, RCP-, code" aria-label="Search" />
          <ul className={styles.list} aria-live="polite">
            {mods.map((m) => <li key={m.key}><Link href={m.route} onClick={close}>Go to {m.label}</Link></li>)}
            {hits.map((h) => <li key={`${h.type}:${h.id}`}><Link href={(ROUTE[h.type] ?? (() => '/admin'))(h.id)} onClick={close}><strong>{h.label}</strong> <span className={styles.type}>{h.type.replace('_', ' ')}{h.via ? ` · ${h.via}` : ''}</span></Link></li>)}
          </ul>
          {restricted ? <Text variant="body" muted>That kind of id is hidden for your role.</Text> : null}
          {note ? <Text variant="body" role="status">{note}</Text> : null}
          {q.trim().length >= 3 && !hits.length && !mods.length && !restricted && !note ? <Text variant="body" muted>No match.</Text> : null}
        </div>
      </Sheet>
    </>
  );
}

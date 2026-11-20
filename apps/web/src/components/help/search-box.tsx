'use client';
// Instant search over titles and summaries (MiniSearch, built in the browser from a small server-provided list).
// Chosen over Fuse or Lunr for its size, prefix and fuzzy matching, and no build step. Keyboard: / or Cmd+K focuses, arrows move, Enter opens.
import MiniSearch from 'minisearch';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import styles from './help.module.css';

export interface SearchDoc {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
}
const RECENT_KEY = 'athleit:help:recent';

function highlight(text: string, q: string): ReactNode {
  const terms = q
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  return text
    .split(new RegExp(`(${terms.join('|')})`, 'ig'))
    .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export function SearchBox({
  docs,
  signedIn,
  autoFocus,
  initial = '',
}: {
  docs: SearchDoc[];
  signedIn: boolean;
  autoFocus?: boolean;
  initial?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const index = useMemo(() => {
    const m = new MiniSearch<SearchDoc>({
      fields: ['title', 'summary'],
      storeFields: ['slug', 'title', 'summary'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
    });
    m.addAll(docs);
    return m;
  }, [docs]);
  const results = useMemo(
    () => (q.trim().length >= 2 ? index.search(q).slice(0, 6) : []),
    [index, q],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const remember = (term: string) => {
    if (!signedIn || term.trim().length < 2) return; // recent searches: signed in, this device only
    try {
      const prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify([term.trim(), ...prev.filter((x) => x !== term.trim())].slice(0, 5)),
      );
    } catch {
      /* storage can be unavailable */
    }
  };
  const submit = () => {
    remember(q);
    router.push(`/help/search?q=${encodeURIComponent(q.trim())}`);
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) {
        remember(q);
        router.push(`/help/a/${results[active]!.slug}`);
        setOpen(false);
      } else submit();
    }
  };

  return (
    <form
      role="search"
      className={styles.searchForm}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="help-search" className={styles.srOnly}>
        Search help
      </label>
      <input
        id="help-search"
        ref={inputRef}
        className={styles.searchInput}
        type="search"
        name="q"
        value={q}
        autoFocus={autoFocus}
        placeholder="Search help"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="help-results"
        aria-activedescendant={active >= 0 ? `help-result-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 ? (
        <ul
          id="help-results"
          role="listbox"
          className={styles.results}
          aria-label="Matching articles"
        >
          {results.map((r, i) => (
            <li key={r.id} role="presentation">
              <a
                id={`help-result-${i}`}
                role="option"
                aria-selected={i === active}
                href={`/help/a/${r.slug}`}
                onMouseDown={() => remember(q)}
              >
                <strong>{highlight(String(r.title), q)}</strong>
                <br />
                <span className={styles.muted}>{highlight(String(r.summary), q)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

/** Used by the search results page: runs the same index and returns matches in order. */
export function useDocsSearch(docs: SearchDoc[], q: string) {
  return useMemo(() => {
    const m = new MiniSearch<SearchDoc>({
      fields: ['title', 'summary'],
      storeFields: ['slug', 'title', 'summary'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
    });
    m.addAll(docs);
    return q.trim().length >= 2 ? m.search(q) : [];
  }, [docs, q]);
}

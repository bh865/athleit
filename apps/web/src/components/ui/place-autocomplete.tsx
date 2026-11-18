'use client';

import {
  canSearch,
  createPlaceSearcher,
  createPlaceSession,
  friendlyError,
  type PlaceSelection,
  type PlaceSuggestion,
} from '@athleit/core';
import { getPlaceDetails, searchPlaces } from '@athleit/db/places';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { getClient } from '@/lib/supabase/browser';

import { Button } from './button';
import { Icon } from './icon';
import { Popover } from './popover';
import styles from './place-autocomplete.module.css';
import { TextField } from './text-field';

export interface PlaceAutocompleteProps {
  label: string;
  /** What is in the box. After a pick this is the confirmed formatted address. */
  value: string;
  /** True once the text came from a picked suggestion (it then has coordinates). */
  verified: boolean;
  /** Typing without picking: the parent keeps the text, coordinates stay empty. */
  onChange: (text: string) => void;
  onSelect: (place: PlaceSelection) => void;
  onClear: () => void;
  error?: string | undefined;
  hint?: string;
  countryCodes?: string[];
  placeholder?: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/**
 * Address search with a WAI-ARIA combobox. Suggestions come from the `places` Edge Function. Picking one
 * fetches its details (same session token) and calls onSelect; typing without picking is allowed.
 */
export function PlaceAutocomplete({
  label,
  value,
  verified,
  onChange,
  onSelect,
  onClear,
  error,
  hint,
  countryCodes,
  placeholder,
}: PlaceAutocompleteProps) {
  const listId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pickError, setPickError] = useState<string | null>(null);
  const [width, setWidth] = useState<number | undefined>();
  const session = useRef(createPlaceSession());
  const countries = countryCodes?.join(',');

  const searcher = useMemo(
    () =>
      createPlaceSearcher({
        fetcher: async (query) => {
          const r = await searchPlaces(getClient(), {
            query,
            sessionToken: session.current.token,
            countryCodes: countries ? countries.split(',') : undefined,
          });
          if (r.error) throw new Error(r.error.message);
          return r.data.suggestions;
        },
        onResult: (list) => {
          setItems(list);
          setStatus(list.length ? 'ready' : 'empty');
          setActive(-1);
        },
        onError: () => setStatus('error'),
        onIdle: () => {
          setItems([]);
          setStatus('idle');
        },
      }),
    [countries],
  );
  useEffect(() => () => searcher.cancel(), [searcher]);

  async function pick(s: PlaceSuggestion) {
    searcher.cancel();
    setOpen(false);
    setPickError(null);
    const r = await getPlaceDetails(getClient(), {
      placeId: s.placeId,
      sessionToken: session.current.token,
      name: s.name,
    });
    session.current.reset();
    if (r.error) {
      setPickError(friendlyError(r.error));
      return;
    }
    onSelect(r.data.selection);
  }

  function change(text: string) {
    onChange(text);
    setPickError(null);
    setOpen(canSearch(text));
    if (canSearch(text)) setStatus('loading');
    if (anchor.current) setWidth(anchor.current.getBoundingClientRect().width);
    searcher.search(text);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && active >= 0 && items[active]) {
      e.preventDefault();
      void pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  if (verified) {
    return (
      <div className={styles.wrap}>
        <TextField label={label} value={value} readOnly />
        <div className={styles.verified} data-testid="place-verified">
          <span className={styles.verifiedText}>
            <Icon name="check-circle" weight="fill" size="sm" /> Address confirmed
          </span>
          <Button variant="ghost" onClick={onClear}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  const showHint = value.trim().length > 0 && !open;
  return (
    <div className={styles.wrap} ref={anchor}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => canSearch(value) && items.length > 0 && setOpen(true)}
        placeholder={placeholder ?? 'Start typing an address'}
        autoComplete="off"
        maxLength={300}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        error={error ?? pickError ?? undefined}
        hint={showHint ? 'Pick a suggestion so the map is accurate' : hint}
      />
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label={`${label} suggestions`}
      >
        <div style={{ width }}>
          {status === 'loading' ? <p className={styles.status}>Searching…</p> : null}
          {status === 'empty' ? <p className={styles.status}>No matches</p> : null}
          {status === 'error' ? (
            <p className={styles.status}>
              Search is not available right now. You can still type it.
            </p>
          ) : null}
          {status === 'ready' ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={`${label} suggestions`}
              className={styles.listbox}
            >
              {items.map((s, i) => (
                <li
                  key={s.placeId}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={styles.option}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(s)}
                >
                  <Icon name="map-pin" />
                  <span className={styles.optionText}>
                    <span className={styles.optionMain}>{s.name}</span>
                    {s.secondary ? <span className={styles.optionSub}>{s.secondary}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.attribution}>Powered by Google</p>
        </div>
      </Popover>
    </div>
  );
}

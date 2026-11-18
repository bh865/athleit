import {
  canSearch,
  createPlaceSearcher,
  createPlaceSession,
  friendlyError,
  type PlaceSelection,
  type PlaceSuggestion,
} from '@athleit/core';
import { getPlaceDetails, searchPlaces } from '@athleit/db/places';
import { space } from '@athleit/tokens';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { supabase } from '@/lib/supabase';

import { Button } from './button';
import { Icon } from './icon';
import { IconCircle, ListGroup, ListRow } from './list-row';
import { Text } from './text';
import { TextField } from './text-field';
import { useTheme } from './theme';

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
 * Address search. Suggestions render inline right under the field (no floating overlay, no nested list), so
 * it works inside a Sheet or ScrollView; rows are plain Pressables, which keeps taps working with the keyboard up.
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
  const { theme } = useTheme();
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [pickError, setPickError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const session = useRef(createPlaceSession());
  const countries = countryCodes?.join(',');

  const searcher = useMemo(
    () =>
      createPlaceSearcher({
        fetcher: async (query) => {
          const r = await searchPlaces(supabase, {
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
    setStatus('idle');
    setItems([]);
    setPickError(null);
    const r = await getPlaceDetails(supabase, {
      placeId: s.placeId,
      sessionToken: session.current.token,
      name: s.name,
    });
    session.current.reset();
    if (r.error) return setPickError(friendlyError(r.error));
    onSelect(r.data.selection);
  }

  if (verified) {
    return (
      <View style={{ gap: space[2] }}>
        <TextField label={label} value={value} editable={false} />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="check-circle" weight="fill" size="sm" color={theme.color.ok} />
            <Text variant="caption" style={{ color: theme.color.ok }}>
              Address confirmed
            </Text>
          </View>
          <Button title="Change" variant="ghost" onPress={onClear} />
        </View>
      </View>
    );
  }

  const typed = value.trim().length > 0;
  const showList = !dismissed && canSearch(value) && status !== 'idle';
  return (
    <View style={{ gap: space[2] }}>
      <TextField
        label={label}
        value={value}
        onChangeText={(t) => {
          onChange(t);
          setPickError(null);
          setDismissed(false);
          if (canSearch(t)) setStatus('loading');
          searcher.search(t);
        }}
        placeholder={placeholder ?? 'Start typing an address'}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={300}
        error={error ?? pickError ?? undefined}
        {...(typed && !showList
          ? { hint: 'Pick a suggestion so the map is accurate' }
          : hint
            ? { hint }
            : {})}
      />
      {showList ? (
        <View>
          {status === 'loading' ? (
            <Text variant="caption" muted>
              Searching…
            </Text>
          ) : null}
          {status === 'empty' ? (
            <Text variant="caption" muted>
              No matches
            </Text>
          ) : null}
          {status === 'error' ? (
            <Text variant="caption" muted>
              Search is not available right now. You can still type it.
            </Text>
          ) : null}
          {status === 'ready' ? (
            <ListGroup testID="place-suggestions">
              {items.map((s, i) => (
                <ListRow
                  key={s.placeId}
                  leading={
                    <IconCircle>
                      <Icon name="map-pin" />
                    </IconCircle>
                  }
                  title={s.name}
                  subtitle={s.secondary || undefined}
                  onPress={() => void pick(s)}
                  last={i === items.length - 1}
                />
              ))}
            </ListGroup>
          ) : null}
          <Text variant="caption" muted style={{ marginTop: space[1] }}>
            Powered by Google
          </Text>
          <Button title="Use what I typed" variant="ghost" onPress={() => setDismissed(true)} />
        </View>
      ) : null}
    </View>
  );
}

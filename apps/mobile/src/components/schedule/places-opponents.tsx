import { friendlyError, locationFromSelection, type PlaceSelection } from '@athleit/core';
import {
  addLocation,
  addOpponent,
  deleteLocation,
  deleteOpponent,
  getLocations,
  getOpponents,
} from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { FormMessage, LoadState } from '@/components/app/kit';
import {
  Button,
  IconButton,
  ListGroup,
  ListRow,
  PlaceAutocomplete,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Done = PromiseLike<{ error: { message: string; code?: string | undefined } | null }>;

/** Saved places for a team (new on mobile): list with remove, add with address search. */
export function PlacesSheet({ open, onClose, teamId }: { open: boolean; onClose: () => void; teamId: string }) {
  return open ? <PlacesBody onClose={onClose} teamId={teamId} /> : null;
}

function PlacesBody({ onClose, teamId }: { onClose: () => void; teamId: string }) {
  const places = useLoad(() => getLocations(supabase, teamId), [teamId]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [picked, setPicked] = useState<PlaceSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(p: Done, after: () => void) {
    setError(null);
    const r = await p;
    if (r.error) return setError(friendlyError(r.error));
    after();
  }

  return (
    <Sheet open onClose={onClose} title="Places">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[4] }} style={{ maxHeight: 560 }}>
        <Text variant="heading">Saved places</Text>
        <LoadState
          loading={places.loading}
          error={places.error}
          empty={(places.data ?? []).length === 0}
          emptyText="No saved places yet."
          onRetry={places.reload}
        >
          <ListGroup>
            {(places.data ?? []).map((l) => (
              <ListRow
                key={l.id}
                title={l.name}
                subtitle={l.address ?? undefined}
                trailing={
                  <IconButton
                    icon="trash"
                    label={`Remove ${l.name}`}
                    onPress={() => void run(deleteLocation(supabase, l.id), places.reload)}
                  />
                }
              />
            ))}
          </ListGroup>
        </LoadState>
        <TextField label="Place name" value={name} onChangeText={setName} maxLength={100} />
        <PlaceAutocomplete
          label="Address (optional)"
          value={address}
          verified={picked !== null}
          onChange={setAddress}
          onSelect={(p) => {
            setPicked(p);
            setAddress(p.formattedAddress);
            setName((n) => (n.trim() ? n : p.name.slice(0, 100)));
          }}
          onClear={() => {
            setPicked(null);
            setAddress('');
          }}
        />
        <Button
          title="Save place"
          variant="secondary"
          disabled={!name.trim()}
          onPress={() =>
            void run(
              addLocation(supabase, {
                team_id: teamId,
                ...(picked
                  ? locationFromSelection(picked, name)
                  : { name: name.trim(), address: address.trim() || null }),
              }),
              () => {
                setName('');
                setAddress('');
                setPicked(null);
                places.reload();
              },
            )
          }
        />
        <FormMessage error={error} />
        <Button title="Done" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}

/** Opponents for a team (new on mobile). */
export function OpponentsSheet({ open, onClose, teamId }: { open: boolean; onClose: () => void; teamId: string }) {
  return open ? <OpponentsBody onClose={onClose} teamId={teamId} /> : null;
}

function OpponentsBody({ onClose, teamId }: { onClose: () => void; teamId: string }) {
  const opps = useLoad(() => getOpponents(supabase, teamId), [teamId]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(p: Done, after: () => void) {
    setError(null);
    const r = await p;
    if (r.error) return setError(friendlyError(r.error));
    after();
  }

  return (
    <Sheet open onClose={onClose} title="Opponents">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[4] }} style={{ maxHeight: 560 }}>
        <Text variant="heading">Opponents</Text>
        <LoadState
          loading={opps.loading}
          error={opps.error}
          empty={(opps.data ?? []).length === 0}
          emptyText="No opponents yet."
          onRetry={opps.reload}
        >
          <ListGroup>
            {(opps.data ?? []).map((o) => (
              <ListRow
                key={o.id}
                title={o.name}
                trailing={
                  <IconButton
                    icon="trash"
                    label={`Remove ${o.name}`}
                    onPress={() => void run(deleteOpponent(supabase, o.id), opps.reload)}
                  />
                }
              />
            ))}
          </ListGroup>
        </LoadState>
        <TextField label="Opponent name" value={name} onChangeText={setName} maxLength={100} />
        <Button
          title="Save opponent"
          variant="secondary"
          disabled={!name.trim()}
          onPress={() =>
            void run(addOpponent(supabase, teamId, name.trim()), () => {
              setName('');
              opps.reload();
            })
          }
        />
        <FormMessage error={error} />
        <View>
          <Button title="Done" variant="ghost" onPress={onClose} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

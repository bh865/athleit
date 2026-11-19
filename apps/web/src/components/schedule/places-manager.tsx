'use client';

import { friendlyError, locationFromSelection, type PlaceSelection } from '@athleit/core';
import { addLocation, deleteLocation, getLocations } from '@athleit/db/scheduling';
import { useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
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
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './schedule.module.css';

/** Saved locations for a team, so staff pick instead of retyping. */
export function PlacesManager({
  open,
  onClose,
  teamId,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
}) {
  const places = useLoad(
    () => (open ? getLocations(getClient(), teamId) : Promise.resolve({ data: [], error: null })),
    [open, teamId],
  );
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [picked, setPicked] = useState<PlaceSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    p: PromiseLike<{ error: { message: string; code?: string | undefined } | null }>,
    after: () => void,
  ) {
    setError(null);
    const r = await p;
    if (r.error) return setError(friendlyError(r.error));
    after();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Places" placement="right">
      <div className={styles.form}>
        <Text variant="heading" as="h2">
          Saved places
        </Text>
        <LoadState
          loading={places.loading}
          error={places.error}
          empty={(places.data ?? []).length === 0}
          emptyText="No saved places yet."
          onRetry={places.reload}
        >
          <ListGroup>
            {(places.data ?? []).map((l) => (
              <li key={l.id}>
                <ListRow
                  title={l.name}
                  subtitle={l.address ?? undefined}
                  trailing={
                    <IconButton
                      icon="trash"
                      label={`Remove ${l.name}`}
                      onClick={() => void run(deleteLocation(getClient(), l.id), places.reload)}
                    />
                  }
                />
              </li>
            ))}
          </ListGroup>
        </LoadState>
        <TextField
          label="Place name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <PlaceAutocomplete
          label="Address (optional)"
          value={address}
          verified={picked !== null}
          onChange={setAddress}
          onSelect={(p) => {
            setPicked(p);
            setAddress(p.formattedAddress);
            // Fill the name from the suggestion only when it is still empty.
            setName((n) => (n.trim() ? n : p.name.slice(0, 100)));
          }}
          onClear={() => {
            setPicked(null);
            setAddress('');
          }}
        />
        <Button
          variant="secondary"
          disabled={!name.trim()}
          onClick={() =>
            void run(
              addLocation(getClient(), {
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
        >
          Save place
        </Button>

        <FormMessage error={error} />
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

'use client';

import {
  fieldErrors,
  friendlyError,
  jerseyConflict,
  jerseyConflictMessage,
  parseJersey,
  placePlayerOnRosterSchema,
  type FieldErrors,
} from '@athleit/core';
import { placePlayerOnRoster } from '@athleit/db/api';
import { useState, type FormEvent } from 'react';

import { FormMessage } from '@/components/app/states';
import { Button, Select, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { PositionPicker } from './parts';
import styles from './roster.module.css';
import type { ReadyChild, RosterRow } from './use-roster-data';

/** The inline "Ready to add" step: child, jersey with live conflict check, position, Add to roster. */
export function AddStep({
  teamId,
  candidates,
  initialPlayerId,
  rows,
  positions,
  onCancel,
  onPlaced,
}: {
  teamId: string;
  candidates: readonly ReadyChild[];
  initialPlayerId: string | null;
  rows: readonly RosterRow[];
  positions: readonly string[];
  onCancel: () => void;
  onPlaced: (playerId: string) => void;
}) {
  const [playerId, setPlayerId] = useState(initialPlayerId ?? candidates[0]?.playerId ?? '');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const jerseyNumber = parseJersey(jersey);
  const conflict = jerseyConflict(rows, jerseyNumber);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = placePlayerOnRosterSchema.safeParse({
      teamId,
      playerId,
      jerseyNumber,
      position: position.trim() || null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const res = await placePlayerOnRoster(getClient(), parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onPlaced(playerId);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={styles.step}
      data-testid="place-form"
      aria-label="Add player to the roster"
    >
      <Select
        name="playerId"
        label="Child"
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
        options={candidates.map((c) => ({ value: c.playerId, label: c.name }))}
      />
      <div className={styles.fields}>
        <TextField
          name="jerseyNumber"
          label="Jersey"
          inputMode="numeric"
          value={jersey}
          onChange={(e) => setJersey(e.target.value)}
          error={
            errors.jerseyNumber ??
            (conflict && jerseyNumber != null
              ? jerseyConflictMessage(jerseyNumber, conflict)
              : undefined)
          }
          hint="Checks other active players as you type."
        />
      </div>
      <PositionPicker
        options={positions}
        value={position}
        onChange={setPosition}
        error={errors.position}
      />
      <FormMessage error={error} />
      <div className={styles.actions}>
        <Button type="submit" loading={busy} disabled={!!conflict}>
          Add to roster
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

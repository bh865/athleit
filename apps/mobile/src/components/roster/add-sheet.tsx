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
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Choice, FormMessage, H2 } from '@/components/app/kit';
import { Button, Sheet, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';

import { PositionPicker } from './parts';
import type { ReadyChild, RosterRow } from './use-roster-data';

/** Add sheet: child (preselected from a Ready to add row), jersey with live conflict check, position. */
export function AddSheet({
  open,
  teamId,
  candidates,
  initialPlayerId,
  rows,
  positions,
  onClose,
  onPlaced,
}: {
  open: boolean;
  teamId: string;
  candidates: readonly ReadyChild[];
  initialPlayerId: string | null;
  rows: readonly RosterRow[];
  positions: readonly string[];
  onClose: () => void;
  onPlaced: (playerId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add player">
      {open && (
        <AddForm
          // A different child (or a reopened sheet) starts a clean form.
          key={initialPlayerId ?? 'first'}
          teamId={teamId}
          candidates={candidates}
          initialPlayerId={initialPlayerId}
          rows={rows}
          positions={positions}
          onClose={onClose}
          onPlaced={onPlaced}
        />
      )}
    </Sheet>
  );
}

function AddForm({
  teamId,
  candidates,
  initialPlayerId,
  rows,
  positions,
  onClose,
  onPlaced,
}: Omit<Parameters<typeof AddSheet>[0], 'open'>) {
  const { height } = useWindowDimensions();
  const [playerId, setPlayerId] = useState(initialPlayerId ?? candidates[0]?.playerId ?? '');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const jerseyNumber = parseJersey(jersey);
  const conflict = jerseyConflict(rows, jerseyNumber);

  async function submit() {
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
    const res = await placePlayerOnRoster(supabase, parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    onPlaced(playerId);
  }

  return (
    <ScrollView
      testID="place-form"
      keyboardShouldPersistTaps="handled"
      style={{ maxHeight: height * 0.7 }}
      contentContainerStyle={{ gap: space[4] }}
    >
      <H2>Add player</H2>
      <Choice
        label="Child"
        value={playerId}
        options={candidates.map((c) => ({ value: c.playerId, label: c.name }))}
        onChange={setPlayerId}
      />
      <TextField
        label="Jersey"
        keyboardType="number-pad"
        value={jersey}
        onChangeText={setJersey}
        hint="Checks other active players as you type."
        error={
          errors.jerseyNumber ??
          (conflict && jerseyNumber != null
            ? jerseyConflictMessage(jerseyNumber, conflict)
            : undefined)
        }
      />
      <PositionPicker
        options={positions}
        value={position}
        onChange={setPosition}
        error={errors.position}
      />
      <FormMessage error={error} />
      <View style={{ gap: space[2] }}>
        <Button
          title="Add to roster"
          loading={busy}
          disabled={!!conflict}
          onPress={() => void submit()}
        />
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

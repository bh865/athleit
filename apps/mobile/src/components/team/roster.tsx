import {
  fieldErrors,
  friendlyError,
  placePlayerOnRosterSchema,
  updateRosterRowSchema,
  type FieldErrors,
} from '@athleit/core';
import {
  getGuardianContacts,
  getJoinRequests,
  getPlayer,
  getRoster,
  placePlayerOnRoster,
  removeFromRoster,
  updateRosterRow,
} from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Badge, Choice, FormMessage, H2, ListItem, LoadState } from '@/components/app/kit';
import { Button, Card, Text, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from './team-context';

type Row = {
  team_player_id: string;
  player_id: string | null;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  position: string | null;
  status: 'active' | 'inactive';
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function RosterSection() {
  const { team, caps } = useTeam();
  const roster = useLoad(() => getRoster(supabase, team.id), [team.id]);
  const requests = useLoad(
    () =>
      caps.has('roster.place')
        ? getJoinRequests(supabase, team.id)
        : Promise.resolve({ data: [], error: null }),
    [team.id],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const rows = (roster.data ?? []) as Row[];
  const onRoster = new Set(rows.map((r) => r.player_id));
  const ready = (requests.data ?? []).filter(
    (r) => r.status === 'approved' && r.player_id && !onRoster.has(r.player_id),
  );
  const reloadAll = () => {
    roster.reload();
    requests.reload();
  };

  if (!caps.has('roster.viewFull')) {
    return (
      <LoadState
        loading={roster.loading}
        error={roster.error}
        empty={rows.length === 0}
        emptyText="No players on the roster yet."
        onRetry={roster.reload}
      >
        <View style={{ gap: spacing[2] }} testID="roster-limited">
          {rows.map((r) => (
            <ListItem
              key={r.team_player_id}
              title={`${r.jersey_number != null ? `#${r.jersey_number}  ` : ''}${r.first_name}`}
              subtitle={r.position ?? undefined}
            />
          ))}
        </View>
      </LoadState>
    );
  }

  return (
    <View style={{ gap: spacing[4] }}>
      {caps.has('roster.place') && (
        <PlaceForm
          teamId={team.id}
          candidates={ready.map((r) => ({
            value: r.player_id as string,
            label: `${r.player_first_name} ${r.player_last_name}`,
          }))}
          onPlaced={reloadAll}
        />
      )}
      <H2>Roster</H2>
      <LoadState
        loading={roster.loading}
        error={roster.error}
        empty={rows.length === 0}
        emptyText="No players on the roster yet. Approve a join request, then add the child here."
        onRetry={roster.reload}
      >
        <View style={{ gap: spacing[2] }} testID="roster-list">
          {rows.map((r) => (
            <View key={r.team_player_id} style={{ gap: spacing[2] }}>
              <ListItem
                title={`${r.jersey_number != null ? `#${r.jersey_number}  ` : ''}${r.first_name} ${r.last_name}`}
                subtitle={r.position ?? undefined}
                right={
                  <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</Badge>
                }
                selected={selected === r.team_player_id}
                onPress={() => setSelected(selected === r.team_player_id ? null : r.team_player_id)}
              />
              {selected === r.team_player_id && (
                <PlayerPanel
                  row={r}
                  canEdit={caps.has('roster.edit')}
                  canSeeContacts={caps.has('contacts.view')}
                  onChanged={reloadAll}
                  onRemoved={() => {
                    setSelected(null);
                    reloadAll();
                  }}
                />
              )}
            </View>
          ))}
        </View>
      </LoadState>
    </View>
  );
}

function PlaceForm({
  teamId,
  candidates,
  onPlaced,
}: {
  teamId: string;
  candidates: { value: string; label: string }[];
  onPlaced: () => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (candidates.length === 0) return null;
  const chosen = playerId || (candidates[0]?.value ?? '');

  async function submit() {
    const parsed = placePlayerOnRosterSchema.safeParse({
      teamId,
      playerId: chosen,
      jerseyNumber: num(jersey),
      position: position || null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const res = await placePlayerOnRoster(supabase, parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setJersey('');
    setPosition('');
    setPlayerId('');
    onPlaced();
  }

  return (
    <Card style={{ gap: spacing[3] }} testID="place-form">
      <H2>Add an approved child to the roster</H2>
      <Choice label="Child" value={chosen} options={candidates} onChange={setPlayerId} />
      <TextField
        label="Jersey number"
        keyboardType="number-pad"
        value={jersey}
        onChangeText={setJersey}
        error={errors.jerseyNumber}
      />
      <TextField
        label="Position"
        value={position}
        onChangeText={setPosition}
        error={errors.position}
      />
      <FormMessage error={error} />
      <Button title="Add to roster" loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

function PlayerPanel({
  row,
  canEdit,
  canSeeContacts,
  onChanged,
  onRemoved,
}: {
  row: Row;
  canEdit: boolean;
  canSeeContacts: boolean;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const playerId = row.player_id as string;
  const player = useLoad(() => getPlayer(supabase, playerId), [playerId]);
  const contacts = useLoad(
    () =>
      canSeeContacts
        ? getGuardianContacts(supabase, playerId)
        : Promise.resolve({ data: [], error: null }),
    [playerId, row.status],
  );
  const [jersey, setJersey] = useState(row.jersey_number?.toString() ?? '');
  const [position, setPosition] = useState(row.position ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(row.status);
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = updateRosterRowSchema.safeParse({
      jerseyNumber: num(jersey),
      position: position.trim() || null,
      status,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await updateRosterRow(supabase, row.team_player_id, {
      jersey_number: parsed.data.jerseyNumber,
      position: parsed.data.position,
      status: parsed.data.status,
    });
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error)); // e.g. jersey already taken
    setSaved(true);
    onChanged();
  }

  async function remove() {
    const res = await removeFromRoster(supabase, row.team_player_id);
    if (res.error) return setError(friendlyError(res.error));
    onRemoved();
  }

  return (
    <Card style={{ gap: spacing[3] }} testID="player-panel">
      <LoadState loading={player.loading} error={player.error} onRetry={player.reload}>
        <Text size="sm" muted>
          {player.data?.first_name} {player.data?.last_name} · born {player.data?.date_of_birth}
        </Text>
      </LoadState>
      {canSeeContacts && (
        <View style={{ gap: spacing[2] }}>
          <Text weight="semibold">Guardian contacts</Text>
          <LoadState
            loading={contacts.loading}
            error={contacts.error}
            empty={contacts.data?.length === 0}
            emptyText="No contact details available. Contacts show for active players only."
            onRetry={contacts.reload}
          >
            {contacts.data?.map((g) => (
              <View key={g.profile_id} style={{ gap: spacing[1] }}>
                <Text weight="semibold">{g.display_name}</Text>
                <Button
                  title={g.email}
                  variant="ghost"
                  onPress={() => void Linking.openURL(`mailto:${g.email}`)}
                />
                {g.phone ? (
                  <Button
                    title={g.phone}
                    variant="ghost"
                    onPress={() => void Linking.openURL(`tel:${g.phone}`)}
                  />
                ) : null}
              </View>
            ))}
          </LoadState>
        </View>
      )}
      {canEdit && (
        <View style={{ gap: spacing[3] }}>
          <TextField
            label="Jersey number"
            keyboardType="number-pad"
            value={jersey}
            onChangeText={setJersey}
            error={errors.jerseyNumber}
          />
          <TextField
            label="Position"
            value={position}
            onChangeText={setPosition}
            error={errors.position}
          />
          <Choice
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          <FormMessage error={error} success={saved ? 'Saved.' : null} />
          <Button title="Save" loading={busy} onPress={() => void save()} />
          <Button title="Remove from roster" variant="secondary" onPress={() => void remove()} />
        </View>
      )}
    </Card>
  );
}

import {
  ageSummary,
  fieldErrors,
  friendlyError,
  fullName,
  jerseyConflict,
  jerseyConflictMessage,
  parseJersey,
  updateRosterRowSchema,
  type FieldErrors,
  type RosterStatus,
} from '@athleit/core';
import { getGuardianContacts, removeFromRoster, updateRosterRow } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, ScrollView, useWindowDimensions, View } from 'react-native';

import { FormMessage, LoadState } from '@/components/app/kit';
import {
  Button,
  Heading,
  Icon,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Jersey, PositionPicker, StatusMark } from './parts';
import { PlayerAvatar } from './player-avatar';
import type { PlayerFacts, RosterRow } from './use-roster-data';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

/** Full-height bottom sheet: identity, guardian contacts, edit form and remove (staff); read-only for club admins. */
export function PlayerSheet(props: {
  row: RosterRow | null;
  rows: readonly RosterRow[];
  facts: PlayerFacts | undefined;
  canEdit: boolean;
  canSeeContacts: boolean;
  positions: readonly string[];
  teamName: string;
  onClose: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const { row, onClose } = props;
  return (
    <Sheet open={row !== null} onClose={onClose} title="Player details">
      {row && (
        <PlayerBody
          key={`${row.team_player_id}:${row.status}:${row.jersey_number}:${row.position}`}
          {...props}
          row={row}
        />
      )}
    </Sheet>
  );
}

function PlayerBody({
  row,
  rows,
  facts,
  canEdit,
  canSeeContacts,
  positions,
  teamName,
  onClose,
  onChanged,
  onRemoved,
}: Omit<Parameters<typeof PlayerSheet>[0], 'row'> & { row: RosterRow }) {
  const toast = useToast();
  const { height } = useWindowDimensions();
  const playerId = row.player_id as string;
  const name = fullName(row);
  const active = row.status === 'active';
  const contacts = useLoad(
    () =>
      canSeeContacts && active
        ? getGuardianContacts(supabase, playerId)
        : Promise.resolve({ data: [], error: null }),
    [playerId, row.status, canSeeContacts],
  );
  const [jersey, setJersey] = useState(row.jersey_number?.toString() ?? '');
  const [position, setPosition] = useState(row.position ?? '');
  const [status, setStatus] = useState<RosterStatus>(row.status);
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const jerseyNumber = parseJersey(jersey);
  const conflict = jerseyConflict(rows, jerseyNumber, {
    ignoreTeamPlayerId: row.team_player_id,
    status,
  });

  async function save() {
    const parsed = updateRosterRowSchema.safeParse({
      jerseyNumber,
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
    if (res.error) return setError(friendlyError(res.error)); // a race the live check missed
    setSaved(true);
    onChanged();
  }

  async function setInactive() {
    setBusy(true);
    const res = await updateRosterRow(supabase, row.team_player_id, {
      jersey_number: row.jersey_number,
      position: row.position,
      status: 'inactive',
    });
    setBusy(false);
    setConfirming(false);
    if (res.error) return setError(friendlyError(res.error));
    toast(`${row.first_name} is now inactive.`);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    const res = await removeFromRoster(supabase, row.team_player_id);
    setBusy(false);
    setConfirming(false);
    if (res.error) return setError(friendlyError(res.error));
    toast(`${row.first_name} was removed from the roster.`);
    onRemoved();
  }

  return (
    <ScrollView
      testID="player-panel"
      keyboardShouldPersistTaps="handled"
      style={{ maxHeight: height * 0.8 }}
      contentContainerStyle={{ gap: space[4] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <PlayerAvatar name={name} photoPath={facts?.photoPath} size="lg" />
        <View style={{ flex: 1, gap: space[1] }}>
          <Heading level="heading">{name}</Heading>
          {facts && (
            <Text variant="caption" muted>
              {ageSummary(facts.age, facts.dateOfBirth)}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Jersey value={row.jersey_number} variant="mono" />
            {row.position ? (
              <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                {row.position}
              </Text>
            ) : null}
            <StatusMark status={row.status} />
          </View>
        </View>
      </View>

      {canSeeContacts && (
        <View style={{ gap: space[3] }}>
          <Text variant="label" muted accessibilityRole="header">
            Guardian contacts
          </Text>
          {active ? (
            <LoadState
              loading={contacts.loading}
              error={contacts.error}
              empty={contacts.data?.length === 0}
              emptyText="No contact details available."
              onRetry={contacts.reload}
            >
              {contacts.data?.map((g) => (
                <View key={g.profile_id} style={{ gap: space[2] }}>
                  <Text variant="bodyBold">
                    {g.display_name}{' '}
                    <Text variant="caption" muted>
                      Guardian
                    </Text>
                  </Text>
                  <Text variant="caption" muted>
                    {[g.email, g.phone].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    <Button
                      title="Email"
                      variant="secondary"
                      icon="envelope-simple"
                      onPress={() => void Linking.openURL(`mailto:${g.email}`)}
                    />
                    {g.phone ? (
                      <Button
                        title="Call"
                        variant="secondary"
                        icon="phone"
                        onPress={() => void Linking.openURL(`tel:${g.phone}`)}
                      />
                    ) : null}
                    <Button
                      title="Copy"
                      variant="ghost"
                      icon="copy"
                      accessibilityLabel={`Copy ${g.display_name}'s contact details`}
                      onPress={() =>
                        void Clipboard.setStringAsync(
                          [g.email, g.phone].filter(Boolean).join(' · '),
                        ).then(() => toast('Copied.'))
                      }
                    />
                  </View>
                </View>
              ))}
            </LoadState>
          ) : (
            <Text variant="caption" muted>
              Contacts are shown for active players only.
            </Text>
          )}
        </View>
      )}

      {canEdit ? (
        <>
          <View style={{ gap: space[3] }}>
            <Text variant="label" muted accessibilityRole="header">
              Edit
            </Text>
            <TextField
              label="Jersey"
              keyboardType="number-pad"
              value={jersey}
              onChangeText={(v) => {
                setJersey(v);
                setSaved(false);
              }}
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
              onChange={(v) => {
                setPosition(v);
                setSaved(false);
              }}
              error={errors.position}
            />
            <View style={{ gap: space[2] }}>
              <SegmentedControl
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={(v) => {
                  setStatus(v);
                  setSaved(false);
                }}
              />
              <Text variant="caption" muted>
                {status === 'inactive'
                  ? 'Inactive hides them from parents. Contacts are no longer shown.'
                  : 'Active players show to parents and keep their contacts here.'}
              </Text>
            </View>
            <FormMessage error={error} success={saved ? 'Saved' : null} />
            <Button title="Save" loading={busy} disabled={!!conflict} onPress={() => void save()} />
            <Button title="Close" variant="ghost" onPress={onClose} />
          </View>
          <Button
            title="Remove from roster"
            variant="ghost"
            icon="user-minus"
            onPress={() => setConfirming(true)}
          />
          <Sheet
            open={confirming}
            onClose={() => setConfirming(false)}
            title={`Remove ${row.first_name}?`}
            level="modal"
          >
            <View style={{ gap: space[3] }} accessibilityRole="alert">
              <Heading level="heading">
                Remove {row.first_name} from {teamName}?
              </Heading>
              <Text muted>
                This deletes their roster entry. If you only want to hide them, set them to Inactive
                instead.
              </Text>
              {/* Safe choice first: it is read and focused first. */}
              {active && (
                <Button
                  title="Set inactive"
                  variant="secondary"
                  loading={busy}
                  onPress={() => void setInactive()}
                />
              )}
              <Button title="Remove" variant="ghost" loading={busy} onPress={() => void remove()} />
              <Button title="Cancel" variant="ghost" onPress={() => setConfirming(false)} />
            </View>
          </Sheet>
        </>
      ) : (
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="lock-simple" size="sm" />
            <Text variant="caption" muted>
              Read-only for club admins
            </Text>
          </View>
          <Button title="Close" variant="ghost" onPress={onClose} />
        </View>
      )}
    </ScrollView>
  );
}

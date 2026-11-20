'use client';

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
import { useEffect, useRef, useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import {
  Button,
  ButtonLink,
  Icon,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { PlayerAvatar } from './player-avatar';
import { Jersey, PositionPicker, StatusMark } from './parts';
import styles from './roster.module.css';
import type { PlayerFacts, RosterRow } from './use-roster-data';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export function PlayerPanel({
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
}: {
  row: RosterRow;
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
  const client = getClient();
  const toast = useToast();
  const playerId = row.player_id as string;
  const name = fullName(row);
  const active = row.status === 'active';
  const contacts = useLoad(
    () =>
      canSeeContacts && active
        ? getGuardianContacts(client, playerId)
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
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
    const res = await updateRosterRow(client, row.team_player_id, {
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
    const res = await updateRosterRow(client, row.team_player_id, {
      jersey_number: row.jersey_number,
      position: row.position,
      status: 'inactive',
    });
    setBusy(false);
    setConfirming(false);
    if (res.error) return setError(friendlyError(res.error));
    setStatus('inactive');
    toast(`${row.first_name} is now inactive.`);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    const res = await removeFromRoster(client, row.team_player_id);
    setBusy(false);
    setConfirming(false);
    if (res.error) return setError(friendlyError(res.error));
    toast(`${row.first_name} was removed from the roster.`);
    onRemoved();
  }

  return (
    <div className={styles.panelInSheet} data-testid="player-panel">
      <div className={styles.identity}>
        <PlayerAvatar name={name} photoPath={facts?.photoPath} size="lg" />
        <div className={styles.identityText}>
          <h2 className={styles.identityName}>{name}</h2>
          {facts && <p className={styles.muted}>{ageSummary(facts.age, facts.dateOfBirth)}</p>}
          <div className={styles.facts}>
            <Jersey value={row.jersey_number} className={styles.jersey} />
            {row.position && <span className={styles.pos}>{row.position}</span>}
            <StatusMark status={row.status} />
          </div>
        </div>
      </div>

      {canSeeContacts && (
        <section className={styles.block} aria-labelledby="contacts-h">
          <h3 className={styles.blockTitle} id="contacts-h">
            Guardian contacts
          </h3>
          {active ? (
            <LoadState
              loading={contacts.loading}
              error={contacts.error}
              empty={contacts.data?.length === 0}
              emptyText="No contact details available."
              onRetry={contacts.reload}
            >
              {contacts.data?.map((g) => (
                <div key={g.profile_id} className={styles.contact}>
                  <p className={styles.contactName}>
                    {g.display_name} <span className={styles.muted}>Guardian</span>
                  </p>
                  <p className={styles.muted}>
                    {g.email}
                    {g.phone ? ` · ${g.phone}` : ''}
                  </p>
                  <div className={styles.contactActions}>
                    <ButtonLink variant="secondary" href={`mailto:${g.email}`}>
                      <Icon name="envelope-simple" size="sm" /> Email
                    </ButtonLink>
                    {g.phone && (
                      <ButtonLink variant="secondary" href={`tel:${g.phone}`}>
                        <Icon name="phone" size="sm" /> Call
                      </ButtonLink>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={`Copy ${g.display_name}'s contact details`}
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText([g.email, g.phone].filter(Boolean).join(' · '))
                          .then(() => toast('Copied.'))
                      }
                    >
                      <Icon name="copy" size="sm" /> Copy
                    </Button>
                  </div>
                </div>
              ))}
            </LoadState>
          ) : (
            <p className={styles.muted}>Contacts are shown for active players only.</p>
          )}
        </section>
      )}

      {canEdit ? (
        <>
          <form onSubmit={save} noValidate className={styles.block} aria-label="Edit player">
            <h3 className={styles.blockTitle}>Edit</h3>
            <TextField
              label="Jersey"
              name="jerseyNumber"
              inputMode="numeric"
              value={jersey}
              onChange={(e) => {
                setJersey(e.target.value);
                setSaved(false);
              }}
              error={
                errors.jerseyNumber ??
                (conflict && jerseyNumber != null
                  ? jerseyConflictMessage(jerseyNumber, conflict)
                  : undefined)
              }
              hint="Checks other active players as you type."
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
            <div>
              <SegmentedControl
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={(v) => {
                  setStatus(v);
                  setSaved(false);
                }}
              />
              <p className={styles.muted}>
                {status === 'inactive'
                  ? 'Inactive hides them from parents. Contacts are no longer shown.'
                  : 'Active players show to parents and keep their contacts here.'}
              </p>
            </div>
            <FormMessage error={error} success={saved ? 'Saved' : null} />
            <div className={styles.actions}>
              <Button type="submit" loading={busy} disabled={!!conflict}>
                Save
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </form>
          <Button variant="ghost" className={styles.quiet} onClick={() => setConfirming(true)}>
            <Icon name="user-minus" size="sm" /> Remove from roster
          </Button>
          <RemoveConfirm
            open={confirming}
            name={row.first_name}
            teamName={teamName}
            alreadyInactive={!active}
            busy={busy}
            onClose={() => setConfirming(false)}
            onSetInactive={() => void setInactive()}
            onRemove={() => void remove()}
          />
        </>
      ) : (
        <div className={styles.block}>
          <p className={styles.readOnly}>
            <Icon name="lock-simple" size="sm" /> Read-only for club admins
          </p>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

function RemoveConfirm({
  open,
  name,
  teamName,
  alreadyInactive,
  busy,
  onClose,
  onSetInactive,
  onRemove,
}: {
  open: boolean;
  name: string;
  teamName: string;
  alreadyInactive: boolean;
  busy: boolean;
  onClose: () => void;
  onSetInactive: () => void;
  onRemove: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  // The Sheet focuses its own container after mount; take focus back for the safe choice.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => safe.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={`Remove ${name}?`} level="modal" role="alertdialog">
      <div className={styles.panelInSheet}>
        <Text variant="heading" as="h2">
          Remove {name} from {teamName}?
        </Text>
        <Text muted as="p">
          This deletes their roster entry. If you only want to hide them, set them to Inactive
          instead.
        </Text>
        <div className={styles.confirmActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!alreadyInactive && (
            <Button ref={safe} variant="secondary" loading={busy} onClick={onSetInactive}>
              Set inactive
            </Button>
          )}
          <Button
            variant="secondary"
            className={styles.dangerBtn}
            loading={busy}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

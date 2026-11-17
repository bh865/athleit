'use client';

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
import { useState, type FormEvent } from 'react';

import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage, LoadState } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import { Badge, Button, Card, Select, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

type RosterRow = {
  team_player_id: string;
  player_id: string | null;
  first_name: string;
  last_name: string | null;
  jersey_number: number | null;
  position: string | null;
  status: 'active' | 'inactive';
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export default function RosterPage() {
  const { team, caps } = useTeam();
  const client = getClient();
  const roster = useLoad(() => getRoster(client, team.id), [team.id]);
  const requests = useLoad(
    () =>
      caps.has('roster.place')
        ? getJoinRequests(client, team.id)
        : Promise.resolve({ data: [], error: null }),
    [team.id],
  );
  const [selected, setSelected] = useState<string | null>(null);

  const full = caps.has('roster.viewFull');
  const rows = (roster.data ?? []) as RosterRow[];
  const onRoster = new Set(rows.map((r) => r.player_id));
  const ready = (requests.data ?? []).filter(
    (r) => r.status === 'approved' && r.player_id && !onRoster.has(r.player_id),
  );

  if (!full) {
    return (
      <LoadState
        loading={roster.loading}
        error={roster.error}
        empty={rows.length === 0}
        emptyText="No players on the roster yet."
        onRetry={roster.reload}
      >
        <ul className={styles.list} data-testid="roster-limited">
          {rows.map((r) => (
            <li key={r.team_player_id} className={styles.item}>
              <strong className={styles.mono} style={{ minWidth: '2.5ch' }}>
                {r.jersey_number != null ? `#${r.jersey_number}` : '–'}
              </strong>
              <span className={styles.grow}>{r.first_name}</span>
              <span className={styles.muted}>{r.position}</span>
            </li>
          ))}
        </ul>
      </LoadState>
    );
  }

  return (
    <>
      {caps.has('roster.place') && (
        <PlaceForm
          teamId={team.id}
          candidates={ready.map((r) => ({
            value: r.player_id as string,
            label: `${r.player_first_name} ${r.player_last_name}`,
          }))}
          onPlaced={() => {
            roster.reload();
            requests.reload();
          }}
        />
      )}
      <section className={styles.stack} aria-labelledby="roster-h">
        <h2 className={styles.section} id="roster-h">
          Roster
        </h2>
        <LoadState
          loading={roster.loading}
          error={roster.error}
          empty={rows.length === 0}
          emptyText="No players on the roster yet. Approve a join request, then add the child here."
          onRetry={roster.reload}
        >
          <ul className={styles.list} data-testid="roster-list">
            {rows.map((r) => (
              <li key={r.team_player_id}>
                <button
                  type="button"
                  className={styles.item}
                  style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                  aria-expanded={selected === r.team_player_id}
                  onClick={() =>
                    setSelected(selected === r.team_player_id ? null : r.team_player_id)
                  }
                >
                  <strong className={styles.mono} style={{ minWidth: '2.5ch' }}>
                    {r.jersey_number != null ? `#${r.jersey_number}` : '–'}
                  </strong>
                  <span className={styles.grow}>
                    {r.first_name} {r.last_name}
                  </span>
                  <span className={styles.muted}>{r.position}</span>
                  <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</Badge>
                </button>
                {selected === r.team_player_id && (
                  <PlayerPanel
                    row={r}
                    canEdit={caps.has('roster.edit')}
                    canSeeContacts={caps.has('contacts.view')}
                    onChanged={() => {
                      roster.reload();
                      requests.reload();
                    }}
                    onRemoved={() => {
                      setSelected(null);
                      roster.reload();
                      requests.reload();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </LoadState>
      </section>
    </>
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
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = placePlayerOnRosterSchema.safeParse({
      teamId,
      playerId: formText(fd, 'playerId'),
      jerseyNumber: num(formText(fd, 'jerseyNumber')),
      position: formText(fd, 'position') || null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const res = await placePlayerOnRoster(getClient(), parsed.data);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    form.reset();
    onPlaced();
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className={styles.stack} data-testid="place-form">
        <h2 className={styles.section}>Add an approved child to the roster</h2>
        <Select name="playerId" label="Child" options={candidates} />
        <div className={styles.row}>
          <TextField
            name="jerseyNumber"
            label="Jersey number"
            inputMode="numeric"
            error={errors.jerseyNumber}
          />
          <TextField name="position" label="Position" error={errors.position} />
        </div>
        <FormMessage error={error} />
        <div>
          <Button type="submit" loading={busy}>
            Add to roster
          </Button>
        </div>
      </form>
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
  row: RosterRow;
  canEdit: boolean;
  canSeeContacts: boolean;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const client = getClient();
  const playerId = row.player_id as string;
  const player = useLoad(() => getPlayer(client, playerId), [playerId]);
  const contacts = useLoad(
    () =>
      canSeeContacts
        ? getGuardianContacts(client, playerId)
        : Promise.resolve({ data: [], error: null }),
    [playerId, row.status],
  );
  const [errors, setErrors] = useState<FieldErrors<'jerseyNumber' | 'position'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = updateRosterRowSchema.safeParse({
      jerseyNumber: num(formText(fd, 'jerseyNumber')),
      position: formText(fd, 'position').trim() || null,
      status: formText(fd, 'status'),
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
    if (res.error) return setError(friendlyError(res.error)); // e.g. jersey already taken
    setSaved(true);
    onChanged();
  }

  async function remove() {
    const res = await removeFromRoster(client, row.team_player_id);
    if (res.error) return setError(friendlyError(res.error));
    onRemoved();
  }

  return (
    <Card
      className={styles.stack}
      data-testid="player-panel"
      style={{ marginTop: 'var(--space-2)' }}
    >
      <LoadState loading={player.loading} error={player.error} onRetry={player.reload}>
        <p className={styles.muted}>
          {player.data?.first_name} {player.data?.last_name} · born {player.data?.date_of_birth}
        </p>
      </LoadState>

      {canSeeContacts && (
        <section aria-label="Guardian contacts" className={styles.stack}>
          <h3 className={styles.section}>Guardian contacts</h3>
          <LoadState
            loading={contacts.loading}
            error={contacts.error}
            empty={contacts.data?.length === 0}
            emptyText="No contact details available. Contacts show for active players only."
            onRetry={contacts.reload}
          >
            <ul className={styles.list}>
              {contacts.data?.map((g) => (
                <li key={g.profile_id} className={styles.item}>
                  <div className={styles.grow}>
                    <strong>{g.display_name}</strong>
                    <p className={styles.muted}>
                      <a href={`mailto:${g.email}`}>{g.email}</a>
                      {g.phone ? (
                        <>
                          {' '}
                          · <a href={`tel:${g.phone}`}>{g.phone}</a>
                        </>
                      ) : (
                        ''
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </LoadState>
        </section>
      )}

      {canEdit && (
        <form
          onSubmit={save}
          noValidate
          className={styles.stack}
          key={`${row.jersey_number}${row.position}${row.status}`}
        >
          <div className={styles.row}>
            <TextField
              name="jerseyNumber"
              label="Jersey number"
              inputMode="numeric"
              defaultValue={row.jersey_number ?? ''}
              error={errors.jerseyNumber}
            />
            <TextField
              name="position"
              label="Position"
              defaultValue={row.position ?? ''}
              error={errors.position}
            />
            <Select
              name="status"
              label="Status"
              defaultValue={row.status}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
          <FormMessage error={error} success={saved ? 'Saved.' : null} />
          <div className={styles.row}>
            <Button type="submit" loading={busy}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => void remove()}>
              Remove from roster
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

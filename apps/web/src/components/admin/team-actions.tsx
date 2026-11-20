'use client';

import { canDo, roleNeededFor, type PlatformRole } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  addNoteAction,
  clearCompAction,
  compTeamAction,
  extendTrialAction,
} from '@/app/admin/actions';
import { Button, DatePicker, Text, TextArea } from '@/components/ui';

import { ConfirmWrite } from './confirm-write';
import styles from './team-actions.module.css';

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
const toInput = (d: Date) => d.toISOString().slice(0, 10);
const endOfDayUtc = (ymd: string) => new Date(`${ymd}T23:59:59Z`).toISOString();

/** Admin actions: each opens the one confirm-with-reason sheet. Locked controls say which role is needed. */
export function TeamActions({
  teamId,
  role,
  trialEndsAt,
  comped,
  compUntil,
}: {
  teamId: string;
  role: PlatformRole;
  trialEndsAt: string | null;
  comped: boolean;
  compUntil: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | 'extend' | 'comp' | 'clear'>(null);
  const [extendTo, setExtendTo] = useState(() =>
    toInput(
      new Date((trialEndsAt ? new Date(trialEndsAt).getTime() : Date.now()) + 7 * 86_400_000),
    ),
  );
  const [compTo, setCompTo] = useState('');
  const can = (a: 'extend_trial' | 'comp_team' | 'clear_comp') => canDo(role, a);
  const lock = (a: 'extend_trial' | 'comp_team' | 'clear_comp') =>
    can(a) ? undefined : `Needs the ${roleNeededFor(a)} role`;
  const close = () => setOpen(null);
  const done = () => router.refresh();

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div>
          <Button
            variant="secondary"
            disabled={!can('extend_trial')}
            title={lock('extend_trial')}
            onClick={() => setOpen('extend')}
          >
            Extend trial
          </Button>
          <Text variant="caption" muted as="p">
            Give the team more days. It keeps full access.
          </Text>
        </div>
        <div>
          <Button
            variant="secondary"
            disabled={!can('comp_team')}
            title={lock('comp_team')}
            onClick={() => setOpen('comp')}
          >
            Comp team
          </Button>
          <Text variant="caption" muted as="p">
            Full access with no charge. Not counted in revenue.
          </Text>
        </div>
        <div>
          <Button
            variant="secondary"
            disabled={!can('clear_comp') || !comped}
            title={lock('clear_comp') ?? (comped ? undefined : 'This team is not comped')}
            onClick={() => setOpen('clear')}
          >
            Clear comp
          </Button>
          <Text variant="caption" muted as="p">
            Return a comped team to normal billing.
          </Text>
        </div>
      </div>
      <Text variant="caption" muted as="p">
        Every action asks for a reason and writes before and after to the audit log. No
        impersonation. No editing team data from here.
      </Text>

      <ConfirmWrite
        open={open === 'extend'}
        onClose={close}
        title="Extend trial"
        confirmLabel="Extend trial"
        onDone={done}
        rows={[
          {
            label: 'Trial ends',
            before: fmtDate(trialEndsAt),
            after: fmtDate(extendTo ? endOfDayUtc(extendTo) : null),
          },
        ]}
        impact={`Trial now ends ${extendTo ? new Date(endOfDayUtc(extendTo)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '…'}. The team keeps full access until then.`}
        onSubmit={(why) => extendTrialAction(teamId, endOfDayUtc(extendTo), why)}
      >
        <DatePicker
          label="New trial end"
          value={extendTo}
          onChange={setExtendTo}
          yearSpan={{ before: 0, after: 2 }}
        />
      </ConfirmWrite>

      <ConfirmWrite
        open={open === 'comp'}
        onClose={close}
        title="Comp team"
        confirmLabel="Comp team"
        onDone={done}
        rows={[
          {
            label: 'Comped',
            before: comped ? `Until ${compUntil ? fmtDate(compUntil) : 'further notice'}` : 'No',
            after: compTo ? `Until ${fmtDate(endOfDayUtc(compTo))}` : 'Until further notice',
          },
        ]}
        impact="The team is never charged and is not counted in monthly recurring revenue."
        onSubmit={(why) => compTeamAction(teamId, compTo ? endOfDayUtc(compTo) : null, why)}
      >
        <DatePicker
          label="Comp until (optional)"
          value={compTo}
          onChange={setCompTo}
          yearSpan={{ before: 0, after: 5 }}
          hint="Leave empty to comp until you clear it."
        />
      </ConfirmWrite>

      <ConfirmWrite
        open={open === 'clear'}
        onClose={close}
        title="Clear comp"
        confirmLabel="Clear comp"
        onDone={done}
        rows={[
          {
            label: 'Comped',
            before: `Until ${compUntil ? fmtDate(compUntil) : 'further notice'}`,
            after: 'No',
          },
        ]}
        // Placeholder wording: confirm with Blake (the design says "Confirm wording with admin_clear_comp").
        impact="Billing resumes for this team. Their trial or subscription state is recalculated."
        onSubmit={(why) => clearCompAction(teamId, why)}
      />
    </div>
  );
}

/** Support notes on a team, club or person. */
export function NoteForm({
  subjectType,
  subjectId,
}: {
  subjectType: 'team' | 'club' | 'person';
  subjectId: string;
}) {
  const { refresh } = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    const r = await addNoteAction(subjectType, subjectId, note);
    setBusy(false);
    if (r.ok) {
      setNote('');
      refresh();
    } else
      setError(
        r.code === 'mfa_required'
          ? 'Verify to add a note, then try again.'
          : 'Couldn’t save the note.',
      );
  }
  return (
    <div className={styles.wrap}>
      <TextArea label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? (
        <Text variant="caption" role="alert">
          {error}
        </Text>
      ) : null}
      <div>
        <Button
          variant="secondary"
          loading={busy}
          disabled={!note.trim()}
          onClick={() => void save()}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

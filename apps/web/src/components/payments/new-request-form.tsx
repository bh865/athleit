'use client';

import {
  computeFees,
  createPaymentEventSchema,
  friendlyError,
  formatCents,
  parseDollarsToCents,
  MIN_CHARGE_CENTS,
  SERVICE_FEE_LABEL,
  ATHLEIT_CHARGE_LABEL,
  type FeePolicy,
} from '@athleit/core';
import {
  createPaymentEvent,
  getActiveFeeConfig,
  publishPaymentEvent,
  type Owner,
} from '@athleit/db/payments';
import { useEffect, useMemo, useState } from 'react';

import { todayIso } from '@athleit/ui-core';

import {
  Button,
  DatePicker,
  Icon,
  Select,
  SegmentedControl,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { Amount } from './money';
import styles from './payments.module.css';

interface RosterPlayer {
  id: string;
  name: string;
}

/** "New payment request": Title, Amount, Due date, For, who pays the card fee (live breakdown), lime "Send request". */
export function NewRequestForm({
  owner,
  canSend,
  defaultPolicy = 'absorb',
  onSent,
  onClose,
}: {
  owner: Owner;
  canSend: boolean;
  defaultPolicy?: FeePolicy;
  onSent: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [audience, setAudience] = useState<'all_active_roster' | 'selected_players'>(
    'all_active_roster',
  );
  const [policy, setPolicy] = useState<FeePolicy>(defaultPolicy);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cfg, setCfg] = useState<Parameters<typeof computeFees>[2] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getActiveFeeConfig(getClient()).then((r) => r.data && setCfg(r.data));
  }, []);
  // Team audiences can be narrowed to selected players (a club sends to every active player on its linked teams).
  useEffect(() => {
    if (!owner.teamId) return;
    void getClient()
      .from('team_players')
      .select('player_id, players(first_name, last_name)')
      .eq('team_id', owner.teamId)
      .eq('status', 'active')
      .then(({ data }) =>
        setRoster(
          (data ?? []).map((r) => {
            const p = r.players as unknown as { first_name: string; last_name: string };
            return { id: r.player_id, name: `${p.first_name} ${p.last_name}` };
          }),
        ),
      );
  }, [owner.teamId]);

  const cents = parseDollarsToCents(amount);
  const preview = useMemo(
    () =>
      cents !== null && cents >= MIN_CHARGE_CENTS && cfg ? computeFees(cents, policy, cfg) : null,
    [cents, policy, cfg],
  );

  const submit = async () => {
    setError(null);
    const parsed = createPaymentEventSchema.safeParse({
      ...owner,
      title,
      amountCents: cents ?? 0,
      dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : '',
      audience,
      playerIds: audience === 'selected_players' ? [...picked] : undefined,
      feePolicy: policy,
    });
    if (!parsed.success) {
      setError(
        cents === null || cents < MIN_CHARGE_CENTS
          ? `Enter an amount of at least ${formatCents(MIN_CHARGE_CENTS)}.`
          : (parsed.error.issues[0]?.message ?? 'Check the form.'),
      );
      return;
    }
    setBusy(true);
    const c = getClient();
    const made = await createPaymentEvent(c, {
      ...owner,
      title: parsed.data.title,
      amountCents: parsed.data.amountCents,
      dueAt: parsed.data.dueAt,
      audience,
      playerIds: parsed.data.playerIds,
      feePolicy: policy,
    });
    if (made.error) {
      setBusy(false);
      return setError(friendlyError(made.error));
    }
    const sent = await publishPaymentEvent(c, made.data);
    setBusy(false);
    if (sent.error)
      return setError(`${friendlyError(sent.error)} Your request was saved as a draft.`);
    toast(`Sent to ${sent.data} ${sent.data === 1 ? 'player' : 'players'}`);
    setTitle('');
    setAmount('');
    setDue('');
    onSent();
    onClose();
  };

  return (
    <>
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.drawerHead}>
          <Text variant="heading" as="h2">
            New payment request
          </Text>
          <button type="button" className={styles.pillButton} aria-label="Close" onClick={onClose}>
            <Icon name="x" size="sm" />
          </button>
        </div>
        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Jersey fee"
          maxLength={100}
        />
        <TextField
          label="Amount per player"
          mono
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="45.00"
        />
        <DatePicker
          label="Due date"
          value={due}
          onChange={setDue}
          min={todayIso()}
          yearSpan={{ before: 0, after: 3 }}
        />
        <Select
          label="For"
          value={audience}
          onChange={(e) => setAudience(e.target.value as typeof audience)}
          options={[
            { value: 'all_active_roster', label: 'Everyone on the active roster' },
            ...(owner.teamId ? [{ value: 'selected_players', label: 'Selected players' }] : []),
          ]}
        />
        {audience === 'selected_players' ? (
          <fieldset className={styles.stack} style={{ border: 0, padding: 0 }}>
            <legend>
              <Text variant="label">Players</Text>
            </legend>
            {roster.map((p) => (
              <label key={p.id} className={styles.row}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={picked.has(p.id)}
                  onChange={() => {
                    const n = new Set(picked);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    setPicked(n);
                  }}
                />
                <Text>{p.name}</Text>
              </label>
            ))}
          </fieldset>
        ) : null}
        <SegmentedControl
          label="Who pays the card fee"
          value={policy}
          options={[
            { value: 'absorb', label: 'We pay the fee' },
            { value: 'pass_on', label: 'Families pay a service fee' },
          ]}
          onChange={setPolicy}
        />
        {preview ? (
          <div className={styles.lines} data-testid="fee-preview" aria-live="polite">
            <div className={styles.line}>
              <Text muted>Request</Text>
              <Amount cents={preview.baseCents} />
            </div>
            {preview.platformFeeCents > 0 ? (
              <div className={styles.line}>
                <Text muted>{ATHLEIT_CHARGE_LABEL}</Text>
                <Amount cents={preview.platformFeeCents} />
              </div>
            ) : null}
            {preview.processingFeeCents > 0 ? (
              <div className={styles.line}>
                <Text muted>{SERVICE_FEE_LABEL}</Text>
                <Amount cents={preview.processingFeeCents} />
              </div>
            ) : null}
            <div className={styles.line}>
              <Text variant="bodyBold">Each family pays</Text>
              <Amount cents={preview.totalCents} variant="monoLg" label="Each family pays" />
            </div>
            <Text variant="caption" muted as="p">
              {policy === 'pass_on'
                ? `Families see a “${SERVICE_FEE_LABEL}” that covers card processing, so your team receives about the full amount. The exact card fee can differ by a few cents.`
                : 'Your team pays the card processing fee, so it receives a little less than the request amount.'}
            </Text>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className={`${styles.notice} ${styles.noticeBad}`}>
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={!canSend}>
          Send request
        </Button>
        {!canSend ? (
          <Text variant="caption" muted as="p">
            Set up payouts first, then you can send requests.
          </Text>
        ) : null}
      </form>
    </>
  );
}

'use client';

import {
  canDo,
  canWriteSetting,
  formatCents,
  parseDollarsToCents,
  type PlatformRole,
} from '@athleit/core';
import type { AdminSetting } from '@athleit/db/admin';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  disableTeamBillingAction,
  enableTeamBillingAction,
  setFeeConfigAction,
  setSettingAction,
  setSportConfigAction,
} from '@/app/admin/actions';
import { Button, Icon, SegmentedControl, Text, TextField } from '@/components/ui';

import { ConfirmWrite } from './confirm-write';
import { Panel } from './kit';
import styles from './settings.module.css';

const BILLING_ENABLED = 'team_subscription.enabled';
const PRICE = 'team_subscription.price_cents';

const show = (s: AdminSetting, v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (s.key === PRICE && typeof v === 'number') return `${formatCents(v)} / month`;
  if (s.value_type === 'boolean') return v ? 'On' : 'Off';
  if (s.value_type === 'integer_array' && Array.isArray(v)) return v.join(', ') || '—';
  if (s.value_type === 'text') return v === '' ? '(empty)' : String(v);
  return `${String(v)}${s.unit ? ` ${s.unit}` : ''}`;
};

interface Counts {
  trialing: number;
  paying: number;
  teams: number;
  trialDays: number;
}

/** One generated card per setting definition: label, description, unit, bounds, role lock, history and edit. A new setting is a database row. */
export function SettingCard({
  setting: s,
  role,
  counts,
}: {
  setting: AdminSetting;
  role: PlatformRole;
  counts: Counts;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [flag, setFlag] = useState<'on' | 'off'>('off');
  const writable = canWriteSetting(role, s.write_role);
  const isBillingSwitch = s.key === BILLING_ENABLED;

  function begin() {
    setDraft(
      s.value_type === 'integer' && s.key === PRICE && typeof s.value === 'number'
        ? (s.value / 100).toFixed(2)
        : s.value_type === 'integer_array' && Array.isArray(s.value)
          ? s.value.join(', ')
          : String(s.value ?? ''),
    );
    setFlag(s.value === true ? 'on' : 'off');
    setOpen(true);
  }

  // Parse the draft into the JSON value the database expects. Null means "not valid yet".
  let next: unknown = null;
  let invalid: string | undefined;
  if (s.value_type === 'boolean') next = flag === 'on';
  else if (s.value_type === 'text') next = draft;
  else if (s.value_type === 'integer_array') {
    const parts = draft
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number);
    if (parts.some((n) => !Number.isInteger(n))) invalid = 'Use whole numbers separated by commas.';
    else next = parts;
  } else if (s.key === PRICE) {
    const c = parseDollarsToCents(draft);
    if (c === null) invalid = 'Enter a dollar amount like 12.00.';
    else next = c;
  } else {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n)) invalid = 'Enter a whole number.';
    else next = n;
  }
  if (!invalid && typeof next === 'number' && s.key !== PRICE) {
    if ((s.min !== null && next < s.min) || (s.max !== null && next > s.max))
      invalid = `Allowed ${s.min ?? '…'} to ${s.max ?? '…'}${s.unit ? ` ${s.unit}` : ''}.`;
  }

  let impact: string | undefined;
  if (s.key === PRICE && typeof next === 'number' && typeof s.value === 'number')
    impact = `Applies to teams that subscribe after now. ${counts.trialing} teams in trial will see ${formatCents(next)} when they subscribe. ${counts.paying} paying teams keep ${formatCents(s.value)}.`;
  if (isBillingSwitch)
    impact =
      flag === 'on'
        ? `Every existing team will start a fresh ${counts.trialDays}-day trial. Nobody loses access.`
        : 'Billing turns off. Every team has full access again and nothing is deleted.';

  async function submit(why: string) {
    if (isBillingSwitch)
      return flag === 'on' ? enableTeamBillingAction(why) : disableTeamBillingAction(why);
    return setSettingAction(s.key, next, why);
  }

  return (
    <article className={styles.card} aria-labelledby={`s-${s.key}`}>
      <header className={styles.head}>
        <div>
          <Text variant="heading" as="h3" id={`s-${s.key}`}>
            {s.label}
          </Text>
          <Text variant="body" muted as="p">
            {s.description}
          </Text>
        </div>
        <div className={styles.value}>{show(s, s.value)}</div>
      </header>
      <footer className={styles.foot}>
        <code>{s.key}</code>
        {s.min !== null || s.max !== null ? (
          <span>
            Allowed {s.min ?? '…'} to {s.max ?? '…'}
            {s.unit ? ` ${s.unit}` : ''}
          </span>
        ) : s.unit ? (
          <span>{s.unit}</span>
        ) : null}
        {writable ? (
          <Button variant="secondary" onClick={begin}>
            Edit
          </Button>
        ) : (
          <span className={styles.lock}>
            <Icon name="lock-simple" size="sm" /> Needs the {s.write_role} role
          </span>
        )}
      </footer>
      <details className={styles.history}>
        <summary>History ({s.history.length})</summary>
        {s.history.length === 0 ? (
          <Text variant="body" muted as="p">
            No changes yet.
          </Text>
        ) : (
          <ul>
            {s.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                : {show(s, h.old)} → {show(s, h.new)}. {h.reason}
              </li>
            ))}
          </ul>
        )}
      </details>
      <ConfirmWrite
        open={open}
        onClose={() => setOpen(false)}
        title={`Change ${s.label.toLowerCase()}`}
        onDone={() => router.refresh()}
        rows={[{ label: s.label, before: show(s, s.value), after: invalid ? '…' : show(s, next) }]}
        impact={impact}
        confirmLabel={invalid ? 'Fix the value' : 'Confirm'}
        onSubmit={async (why) =>
          invalid
            ? { ok: false as const, code: 'invalid_setting_value' as const, message: invalid }
            : submit(why)
        }
      >
        {s.value_type === 'boolean' ? (
          <SegmentedControl
            label={s.label}
            value={flag}
            onChange={setFlag}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        ) : (
          <TextField
            label={s.key === PRICE ? 'New price in dollars' : 'New value'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            error={invalid}
            mono={s.value_type !== 'text'}
            hint={s.unit ?? undefined}
          />
        )}
      </ConfirmWrite>
    </article>
  );
}

// Fee configuration (owner edits, admin reads) ----------------------------------------------------------------------------------
export interface FeeConfigView {
  flat: number;
  bps: number;
  stripeBps: number;
  stripeFixed: number;
  refundChargeFull: boolean;
  refundChargePartial: boolean;
  refundServiceFull: boolean;
  refundServicePartial: boolean;
}
export function FeeCard({ fee, role }: { fee: FeeConfigView; role: PlatformRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [flat, setFlat] = useState('');
  const [bps, setBps] = useState('');
  const can = canDo(role, 'change_fee_config');
  const f = parseDollarsToCents(flat);
  const b = Number(bps);
  const invalid =
    f === null || !Number.isInteger(b) || b < 0 || b > 2000 || f > 10000
      ? 'Flat fee up to $100.00 and basis points up to 2000.'
      : undefined;
  const line = (cents: number, basis: number) => `${formatCents(cents)} + ${basis} bps`;
  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <div>
          <Text variant="heading" as="h3">
            Athleit fee per payment
          </Text>
          <Text variant="body" muted as="p">
            Charged on every parent payment. Stripe’s own fee ({fee.stripeBps / 100}% +{' '}
            {formatCents(fee.stripeFixed)}) is separate.
          </Text>
        </div>
        <div className={styles.value}>{line(fee.flat, fee.bps)}</div>
      </header>
      <footer className={styles.foot}>
        <code>fee_config</code>
        {can ? (
          <Button
            variant="secondary"
            onClick={() => {
              setFlat((fee.flat / 100).toFixed(2));
              setBps(String(fee.bps));
              setOpen(true);
            }}
          >
            Edit
          </Button>
        ) : (
          <span className={styles.lock}>
            <Icon name="lock-simple" size="sm" /> Needs the owner role
          </span>
        )}
      </footer>
      <ConfirmWrite
        open={open}
        onClose={() => setOpen(false)}
        title="Change fee configuration"
        onDone={() => router.refresh()}
        rows={[
          {
            label: 'Athleit fee',
            before: line(fee.flat, fee.bps),
            after: invalid ? '…' : line(f ?? 0, b),
          },
        ]}
        impact={
          invalid
            ? undefined
            : `A $100.00 payment would carry a ${formatCents((f ?? 0) + Math.floor((10000 * b) / 10000))} Athleit fee. Applies to new payments; payments already created keep their fee.`
        }
        onSubmit={async (why) =>
          invalid
            ? { ok: false as const, code: 'invalid_setting_value' as const, message: invalid }
            : setFeeConfigAction(
                {
                  flatCents: f ?? 0,
                  bps: b,
                  stripeBps: fee.stripeBps,
                  stripeFixedCents: fee.stripeFixed,
                  refundChargeFull: fee.refundChargeFull,
                  refundChargePartial: fee.refundChargePartial,
                  refundServiceFull: fee.refundServiceFull,
                  refundServicePartial: fee.refundServicePartial,
                },
                why,
              )
        }
      >
        <TextField
          label="Flat fee in dollars"
          value={flat}
          onChange={(e) => setFlat(e.target.value)}
          mono
        />
        <TextField
          label="Percentage in basis points (100 = 1%)"
          value={bps}
          onChange={(e) => setBps(e.target.value)}
          mono
          error={invalid}
        />
      </ConfirmWrite>
    </article>
  );
}

// Sport configuration (admin) --------------------------------------------------------------------------------------------------------
export interface SportView {
  sport: string;
  period_type: string;
  default_period_count: number;
  default_period_minutes: number | null;
  ties_allowed: boolean;
  positions: string[];
  scoring_label: string;
}
export function SportCard({ sport: sp, role }: { sport: SportView; role: PlatformRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(sp.default_period_count));
  const [minutes, setMinutes] = useState(String(sp.default_period_minutes ?? ''));
  const [positions, setPositions] = useState(sp.positions.join(', '));
  const can = canDo(role, 'edit_sport_config');
  const c = Number(count);
  const m = minutes.trim() === '' ? null : Number(minutes);
  const invalid =
    !Number.isInteger(c) ||
    c < 1 ||
    c > 12 ||
    (m !== null && (!Number.isInteger(m) || m < 1 || m > 120))
      ? 'Periods 1 to 12, minutes 1 to 120 (leave minutes empty for innings and sets).'
      : undefined;
  const desc = (n: number, mm: number | null, pos: string) =>
    `${n} × ${sp.period_type}${mm ? ` of ${mm} min` : ''}; ${pos || 'no positions'}`;
  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <div>
          <Text variant="heading" as="h3">
            {sp.sport[0]!.toUpperCase() + sp.sport.slice(1)}
          </Text>
          <Text variant="body" muted as="p">
            {desc(sp.default_period_count, sp.default_period_minutes, sp.positions.join(', '))}.
            Scoring: {sp.scoring_label}.
          </Text>
        </div>
        {can ? (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Edit
          </Button>
        ) : (
          <span className={styles.lock}>
            <Icon name="lock-simple" size="sm" /> Needs the admin role
          </span>
        )}
      </header>
      <ConfirmWrite
        open={open}
        onClose={() => setOpen(false)}
        title={`Change ${sp.sport} defaults`}
        onDone={() => router.refresh()}
        rows={[
          {
            label: 'Defaults',
            before: desc(
              sp.default_period_count,
              sp.default_period_minutes,
              sp.positions.join(', '),
            ),
            after: invalid ? '…' : desc(c, m, positions),
          },
        ]}
        impact="Applies to events created after this change. Existing events keep their settings."
        onSubmit={async (why) =>
          invalid
            ? { ok: false as const, code: 'invalid_setting_value' as const, message: invalid }
            : setSportConfigAction(
                {
                  sport: sp.sport,
                  periodType: sp.period_type,
                  periodCount: c,
                  periodMinutes: m,
                  tiesAllowed: sp.ties_allowed,
                  positions: positions
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                  scoringLabel: sp.scoring_label,
                },
                why,
              )
        }
      >
        <TextField label="Periods" value={count} onChange={(e) => setCount(e.target.value)} mono />
        <TextField
          label="Minutes per period"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          mono
          error={invalid}
        />
        <TextField
          label="Positions (comma separated)"
          value={positions}
          onChange={(e) => setPositions(e.target.value)}
        />
      </ConfirmWrite>
    </article>
  );
}

export const SettingsGroup = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Panel title={title}>
    <div className={styles.stack}>{children}</div>
  </Panel>
);

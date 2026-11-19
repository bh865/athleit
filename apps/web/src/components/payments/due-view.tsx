'use client';

import {
  clearGroup,
  dueLabel,
  dueState,
  dueThisWeek,
  filterCounts,
  filterOf,
  formatCents,
  groupFullySelected,
  groupRequests,
  isSelectable,
  overdueSummary,
  preselect,
  selectGroup,
  separateInfo,
  sumCents,
  toggleRequest,
  type DueFilter,
  type GroupBy,
  type PayRow,
} from '@athleit/core';
import {
  cancelOpenPayment,
  type HouseholdPaymentRow,
  type OpenPaymentRow,
} from '@athleit/db/payments';
import { useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  SegmentedControl,
  Text,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { Amount, requestSummaryLabel } from './money';
import styles from './parent-pay.module.css';
import { StatusPill, type PillTone } from './status-pill';

const asRows = (rows: readonly HouseholdPaymentRow[]) => rows as unknown as PayRow[];

const PILL: Record<string, { tone: PillTone; icon: Parameters<typeof Icon>[0]['name'] }> = {
  overdue: { tone: 'bad', icon: 'warning' },
  today: { tone: 'warn', icon: 'clock' },
  soon: { tone: 'warn', icon: 'clock' },
  later: { tone: 'neutral', icon: 'calendar-blank' },
  processing: { tone: 'warn', icon: 'hourglass' },
  paid: { tone: 'ok', icon: 'check-circle' },
  refunded: { tone: 'neutral', icon: 'arrow-bend-up-left' },
  closed: { tone: 'neutral', icon: 'minus-circle' },
};

/** The Due tab: summary, filter, groups, and the payment summary panel (a sticky bar below tablet width). */
export function DueView({
  rows: data,
  open = [],
  onChanged,
  loading,
  error,
  onRetry,
  linked,
  onPay,
  onReceipts,
}: {
  rows: readonly HouseholdPaymentRow[] | null;
  /** Payments started but not finished (no card entered). Their requests show as processing. */
  open?: readonly OpenPaymentRow[];
  /** Called after an unfinished payment is canceled so the lists reload. */
  onChanged?: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  linked: string | null;
  onPay: (ids: string[]) => void;
  onReceipts: () => void;
}) {
  const rows = asRows(data ?? []);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [pickedFilter, setFilter] = useState<DueFilter | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const toast = useToast();
  const [by, setBy] = useState<GroupBy>('child');
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  if (loading)
    return (
      <div className={styles.main} role="status" aria-label="Loading your payments">
        <span className={styles.skel} />
        <span className={styles.skel} />
        <span className={styles.skel} />
      </div>
    );
  if (error)
    return (
      <ErrorState
        message="Can’t load your payments. Check your connection and try again. Nothing was charged."
        onRetry={onRetry}
      />
    );
  if (rows.length === 0)
    return (
      <EmptyState
        icon="tray"
        title="Nothing to pay yet"
        body="When your team sends a payment request, it will show up here."
      />
    );

  const counts = filterCounts(rows);
  if (counts.needs === 0 && counts.processing === 0)
    return (
      <EmptyState
        icon="check"
        title="You’re all paid up"
        body={`Nothing is due${[...new Set(rows.map((r) => r.player_first_name))].length ? ` for ${[...new Set(rows.map((r) => r.player_first_name))].join(' or ')}` : ''}. Your receipts are saved.`}
        action={
          <Button variant="secondary" onClick={onReceipts}>
            <Icon name="receipt" size="sm" /> View receipts
          </Button>
        }
      />
    );

  // Only ticks on requests that can still be paid count, even if the list changed since they were picked.
  const base = picked ?? preselect(rows, linked);
  const selected = new Set(
    [...base].filter((id) => rows.some((r) => r.request_id === id && isSelectable(r))),
  );
  const chosen = rows.filter((r) => selected.has(r.request_id));
  const total = sumCents(chosen.map((r) => r.amount_cents));
  const payable = rows.filter(isSelectable);
  const over = overdueSummary(rows);
  const week = dueThisWeek(rows);
  const sep = separateInfo(rows, selected);
  // When nothing needs paying but a payment is waiting on us, open on that list so it is not hidden.
  const filter: DueFilter =
    pickedFilter ?? (counts.needs === 0 && counts.processing > 0 ? 'processing' : 'needs');
  const unfinished = new Set(open.flatMap((o) => o.request_ids));
  const shown = rows.filter((r) => filterOf(r) === filter);
  const groups = groupRequests(shown, by);
  const anySelected = chosen.length > 0;

  const payButton = (
    <Button
      size="lg"
      fullWidth
      disabled={!anySelected}
      onClick={() => onPay(chosen.map((r) => r.request_id))}
    >
      <Icon name="lock-simple" size="sm" /> Pay {formatCents(total)}
    </Button>
  );

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {open.map((o) => {
          const titles = o.request_ids
            .map((id) => rows.find((r) => r.request_id === id))
            .filter((r): r is PayRow => Boolean(r))
            .map((r) => `${r.title} (${r.player_first_name})`);
          return (
            <div
              key={o.payment_id}
              className={styles.note}
              role="status"
              data-testid="unfinished-payment"
            >
              <Icon name="info" size="sm" />
              <span className={styles.grow}>
                <strong>Payment not finished.</strong> {titles.join(', ') || 'A payment'} was
                started but not paid. Nothing was charged. Cancel it to pay these again.
              </span>
              <Button
                variant="secondary"
                loading={cancelling === o.payment_id}
                onClick={async () => {
                  setCancelling(o.payment_id);
                  const r = await cancelOpenPayment(getClient(), o.payment_id);
                  setCancelling(null);
                  toast(
                    r.error
                      ? 'Could not cancel that payment. Try again.'
                      : 'Payment canceled. You can pay again.',
                    r.error ? 'danger' : 'success',
                  );
                  onChanged?.();
                }}
              >
                Cancel payment
              </Button>
            </div>
          );
        })}
        <section className={styles.summary} aria-label="Amount due">
          <span className={styles.kicker}>Amount due</span>
          <Amount cents={total} variant="monoXl" label="Amount due" />
          <p className={styles.quiet}>
            {chosen.length} of {payable.length} {payable.length === 1 ? 'request' : 'requests'}{' '}
            selected
            {sep.mixed && sep.next
              ? ` · ${sep.next.titles.join(', ')} ${sep.next.titles.length === 1 ? 'is' : 'are'} paid separately`
              : linked && chosen.length === 1 && picked === null
                ? ' · opened from a payment link'
                : week > 0
                  ? ` · ${week} due this week`
                  : ''}
          </p>
          {over.count > 0 && over.oldest ? (
            <p className={styles.strip} role="status">
              <Icon name="warning" size="sm" weight="fill" /> <strong>{over.count} overdue</strong>
              <span>
                · Oldest: {over.oldest.title} for {over.oldest.player}, {over.oldest.days}{' '}
                {over.oldest.days === 1 ? 'day' : 'days'} late
              </span>
            </p>
          ) : null}
        </section>

        <div className={styles.toolbar}>
          <SegmentedControl
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'needs', label: `Needs payment ${counts.needs}` },
              { value: 'processing', label: `Processing ${counts.processing}` },
              { value: 'paid', label: `Paid ${counts.paid}` },
            ]}
          />
          <span className={styles.row}>
            <span className={styles.quiet}>Group by</span>
            <SegmentedControl
              label="Group by"
              value={by}
              onChange={setBy}
              options={[
                { value: 'child', label: 'Child' },
                { value: 'team', label: 'Team' },
              ]}
            />
          </span>
        </div>

        {filter === 'needs' && sep.mixed && sep.next ? (
          <p className={styles.note} role="note">
            <Icon name="info" size="sm" />
            <span>
              These are paid separately. Pay one group at a time. {sep.next.titles.join(', ')} goes
              to {sep.next.payee}, so it is next.
            </span>
          </p>
        ) : null}

        {groups.length === 0 ? <p className={styles.quiet}>Nothing here.</p> : null}
        {groups.map((g) => {
          const open = !closed[g.key];
          const full = groupFullySelected(selected, g.rows);
          return (
            <section key={g.key} className={styles.group} aria-label={g.label}>
              <div className={styles.groupHead}>
                <button
                  type="button"
                  className={styles.groupToggle}
                  aria-expanded={open}
                  onClick={() => setClosed((c) => ({ ...c, [g.key]: open }))}
                >
                  <span className={styles.avatar} aria-hidden>
                    {g.label.charAt(0)}
                  </span>
                  <span className={styles.grow}>
                    <Text variant="bodyBold" as="div">
                      {g.label}
                    </Text>
                    <span className={styles.quiet}>
                      {g.rows.length} {g.rows.length === 1 ? 'request' : 'requests'}
                    </span>
                  </span>
                  <Amount cents={g.cents} />
                  <Icon name={open ? 'caret-up' : 'caret-down'} size="sm" />
                </button>
                {filter === 'needs' && g.rows.some(isSelectable) ? (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() =>
                      setPicked(full ? clearGroup(selected, g.rows) : selectGroup(selected, g.rows))
                    }
                  >
                    {full ? 'Clear' : 'Select all'}
                  </button>
                ) : null}
              </div>
              {open ? (
                <ul className={styles.reqs} aria-label={`${g.label} requests`}>
                  {g.rows.map((r) => {
                    const st = dueState(r);
                    const pill = PILL[st.kind]!;
                    const can = isSelectable(r);
                    const on = selected.has(r.request_id);
                    return (
                      <li
                        key={r.request_id}
                        className={`${styles.reqCard} ${can ? '' : styles.reqQuiet}`}
                      >
                        {can ? (
                          <label className={styles.checkLabel}>
                            <input
                              type="checkbox"
                              className={styles.check}
                              checked={on}
                              onChange={() =>
                                setPicked(toggleRequest(selected, rows, r.request_id))
                              }
                              aria-label={requestSummaryLabel({
                                title: r.title,
                                cents: r.amount_cents,
                                dueAt: r.due_at,
                                status: 'unpaid',
                              })}
                            />
                          </label>
                        ) : null}
                        <span className={styles.grow}>
                          <Text variant="bodyBold" as="div">
                            {r.title}
                          </Text>
                          <span className={styles.quiet}>
                            {by === 'child' ? r.issuer_name : r.player_first_name}
                          </span>
                        </span>
                        <StatusPill tone={pill.tone} icon={pill.icon}>
                          {unfinished.has(r.request_id) ? 'Not finished' : dueLabel(r)}
                        </StatusPill>
                        <Amount cents={r.amount_cents} />
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      <aside className={styles.panel} aria-label="Payment summary">
        <span className={styles.kicker}>Payment summary</span>
        {chosen.length === 0 ? (
          <p className={styles.quiet}>Pick the requests you want to pay.</p>
        ) : null}
        {chosen.map((r) => (
          <div key={r.request_id} className={styles.panelLine}>
            <span>
              {r.title} · {r.player_first_name}
            </span>
            <Amount cents={r.amount_cents} />
          </div>
        ))}
        <div className={`${styles.panelLine} ${styles.panelTotal}`}>
          <span>Total</span>
          <Amount cents={total} />
        </div>
        <p className={styles.quiet}>Athleit charge and service fee are added at checkout.</p>
        {payButton}
        {sep.mixed && sep.next ? (
          <p className={styles.quiet}>
            <Icon name="arrow-bend-up-left" size="sm" /> Pay next: {sep.next.payee} ·{' '}
            {formatCents(sep.next.cents)}
          </p>
        ) : null}
      </aside>

      <div className={styles.bar}>
        <span>
          <span className={styles.quiet}>{chosen.length} selected</span>
          <Amount cents={total} variant="monoLg" label="Total" />
        </span>
        <Button disabled={!anySelected} onClick={() => onPay(chosen.map((r) => r.request_id))}>
          <Icon name="lock-simple" size="sm" /> Pay {formatCents(total)}
        </Button>
      </div>
    </div>
  );
}

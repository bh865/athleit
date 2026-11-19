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
  type PayRow,
} from '@athleit/core';
import {
  cancelOpenPayment,
  type HouseholdPaymentRow,
  type OpenPaymentRow,
} from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScreenFooter } from '@/components/app/screen-footer';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Text,
  useTheme,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';

import { Amount } from './money';
import { DUE_PILL, Kicker, Row, Strip, StatusPill } from './pay-parts';

/**
 * The Due tab, the same rules as web: every payable request preselected (or just the linked one), grouped by
 * child with subtotals, a due-state pill on each request, and the Pay bar pinned above the tab bar.
 */
export function DueTab({
  data,
  open,
  onChanged,
  loading,
  error,
  onRetry,
  linked,
  onPay,
  onReceipts,
}: {
  data: readonly HouseholdPaymentRow[] | null;
  open: readonly OpenPaymentRow[];
  onChanged: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  linked: string | null;
  onPay: (ids: string[]) => void;
  onReceipts: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const toast = useToast();
  const rows = (data ?? []) as unknown as PayRow[];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [pickedFilter, setFilter] = useState<DueFilter | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (loading) return <LoadingSkeleton />;
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
  if (counts.needs === 0 && counts.processing === 0) {
    const kids = [...new Set(rows.map((r) => r.player_first_name))].filter(Boolean);
    return (
      <EmptyState
        icon="check"
        title="You’re all paid up"
        body={`Nothing is due${kids.length ? ` for ${kids.join(' or ')}` : ''}. Your receipts are saved.`}
        action={
          <Button title="View receipts" variant="secondary" icon="receipt" onPress={onReceipts} />
        }
      />
    );
  }

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
  const groups = groupRequests(
    rows.filter((r) => filterOf(r) === filter),
    'child',
  );

  return (
    <View style={{ gap: space[4] }}>
      {open.map((o) => {
        const titles = o.request_ids
          .map((id) => rows.find((r) => r.request_id === id))
          .filter((r): r is PayRow => Boolean(r))
          .map((r) => `${r.title} (${r.player_first_name})`);
        return (
          <Card key={o.payment_id} style={{ gap: space[3] }} testID="unfinished-payment">
            <Strip tone="neutral" icon="info">
              <Text variant="label">Payment not finished. </Text>
              {titles.join(', ') || 'A payment'} was started but not paid. Nothing was charged.
              Cancel it to pay these again.
            </Strip>
            <Button
              title="Cancel payment"
              variant="secondary"
              loading={cancelling === o.payment_id}
              onPress={async () => {
                setCancelling(o.payment_id);
                const r = await cancelOpenPayment(supabase, o.payment_id);
                setCancelling(null);
                toast(
                  r.error
                    ? 'Could not cancel that payment. Try again.'
                    : 'Payment canceled. You can pay again.',
                  r.error ? 'danger' : 'success',
                );
                onChanged();
              }}
            />
          </Card>
        );
      })}

      <Card style={{ gap: space[2] }}>
        <Kicker>Amount due</Kicker>
        <Amount cents={total} variant="monoXl" label="Amount due" />
        <Text variant="caption" muted accessibilityLiveRegion="polite">
          {chosen.length} of {payable.length} selected
          {sep.mixed && sep.next
            ? ` · ${sep.next.titles.length} paid separately`
            : linked && chosen.length === 1 && picked === null
              ? ' · opened from a payment link'
              : week > 0
                ? ` · ${week} due this week`
                : ''}
        </Text>
        {over.count > 0 && over.oldest ? (
          <Strip tone="bad" icon="warning">
            <Text variant="label" style={{ color: c.bad }}>
              {over.count} overdue
            </Text>
            {' · '}Oldest: {over.oldest.title} for {over.oldest.player}, {over.oldest.days}{' '}
            {over.oldest.days === 1 ? 'day' : 'days'} late
          </Strip>
        ) : null}
      </Card>

      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}
        accessibilityRole="tablist"
      >
        {(
          [
            ['needs', 'Needs payment', counts.needs],
            ['processing', 'Processing', counts.processing],
            ['paid', 'Paid', counts.paid],
          ] as const
        ).map(([value, label, n]) => (
          <Chip
            key={value}
            label={`${label} ${n}`}
            selected={filter === value}
            accessibilityRole="radio"
            onPress={() => setFilter(value)}
          />
        ))}
      </View>

      {filter === 'needs' && sep.mixed && sep.next ? (
        <Strip tone="neutral" icon="info">
          These are paid separately. Pay one group at a time. {sep.next.titles.join(', ')} goes to{' '}
          {sep.next.payee}, so it is next.
        </Strip>
      ) : null}

      {groups.length === 0 ? <Text muted>Nothing here.</Text> : null}
      {groups.map((g) => {
        const isOpen = !closed[g.key];
        const full = groupFullySelected(selected, g.rows);
        const canSelect = filter === 'needs' && g.rows.some(isSelectable);
        return (
          <View key={g.key} style={{ gap: space[2] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${g.label}, ${g.rows.length} ${g.rows.length === 1 ? 'request' : 'requests'}, ${formatCents(g.cents)}`}
              onPress={() => setClosed((x) => ({ ...x, [g.key]: isOpen }))}
              style={{
                minHeight: componentTokens.minTarget,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
              }}
            >
              <Avatar name={g.label} size="sm" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{g.label}</Text>
                <Text variant="caption" muted>
                  {g.rows.length} {g.rows.length === 1 ? 'request' : 'requests'}
                </Text>
              </View>
              <Amount cents={g.cents} />
              <Icon name={isOpen ? 'caret-up' : 'caret-down'} size="sm" color={c.muted} />
            </Pressable>

            {isOpen
              ? g.rows.map((r) => {
                  const can = isSelectable(r);
                  const on = selected.has(r.request_id);
                  const st = dueState(r);
                  const pill = DUE_PILL[st.kind]!;
                  const label = unfinished.has(r.request_id) ? 'Not finished' : dueLabel(r);
                  return (
                    <Pressable
                      key={r.request_id}
                      disabled={!can}
                      onPress={() => setPicked(toggleRequest(selected, rows, r.request_id))}
                      accessibilityRole={can ? 'checkbox' : 'text'}
                      accessibilityState={can ? { checked: on } : {}}
                      accessibilityLabel={`${r.title}, ${r.issuer_name}, ${formatCents(r.amount_cents)}, ${label}`}
                      style={{
                        minHeight: componentTokens.listRow.height,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[3],
                        padding: space[4],
                        borderRadius: componentTokens.card.radius,
                        borderWidth: componentTokens.card.border,
                        borderColor: c.line,
                        backgroundColor: can ? c.surface : 'transparent',
                      }}
                    >
                      {can ? (
                        <Icon
                          name={on ? 'check-circle' : 'circle-dashed'}
                          weight={on ? 'fill' : 'regular'}
                          color={on ? c.ink : c.muted}
                        />
                      ) : null}
                      <View style={{ flex: 1, gap: space[1] }}>
                        <Text variant="bodyBold" muted={!can}>
                          {r.title}
                        </Text>
                        <Text variant="caption" muted numberOfLines={1}>
                          {r.issuer_name}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                        <Amount cents={r.amount_cents} />
                        <StatusPill tone={pill.tone} icon={pill.icon}>
                          {label}
                        </StatusPill>
                      </View>
                    </Pressable>
                  );
                })
              : null}

            {isOpen && canSelect ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setPicked(full ? clearGroup(selected, g.rows) : selectGroup(selected, g.rows))
                }
                style={{
                  alignSelf: 'flex-start',
                  minHeight: componentTokens.minTarget,
                  justifyContent: 'center',
                  paddingHorizontal: space[4],
                  borderRadius: radius.pill,
                  backgroundColor: c.surfaceAlt,
                }}
              >
                <Text variant="caption">{full ? 'Clear' : 'Select all'}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {/* Room so the last request is not hidden behind the pinned bar. */}
      {chosen.length > 0 ? <View style={{ height: space[12] * 2 }} /> : null}

      {chosen.length > 0 ? (
        <ScreenFooter>
          <PayBar
            count={chosen.length}
            of={payable.length}
            cents={total}
            next={
              sep.mixed && sep.next
                ? `Pay next: ${sep.next.payee} · ${formatCents(sep.next.cents)}`
                : null
            }
            onPay={() => onPay(chosen.map((r) => r.request_id))}
          />
        </ScreenFooter>
      ) : null}
    </View>
  );
}

/** Selected count, total and the lime Pay pill. It stays above the tab bar while the list scrolls. */
function PayBar({
  count,
  of,
  cents,
  next,
  onPay,
}: {
  count: number;
  of: number;
  cents: number;
  next: string | null;
  onPay: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  return (
    <View
      style={{
        gap: space[1],
        padding: space[3],
        borderRadius: componentTokens.card.radius,
        borderWidth: componentTokens.card.border,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <Row
        k={
          <View>
            <Text variant="caption" muted>
              {count} of {of} selected
            </Text>
            <Amount cents={cents} variant="monoLg" label="Total" />
          </View>
        }
        v={
          <Button
            title={`Pay ${formatCents(cents)}`}
            icon="lock-simple"
            onPress={onPay}
            testID="pay-button"
          />
        }
      />
      {next ? (
        <Text variant="caption" muted>
          {next}
        </Text>
      ) : null}
    </View>
  );
}

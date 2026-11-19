import {
  clearGroup,
  dueLabel,
  dueState,
  dueThisWeek,
  filterCounts,
  filterOf,
  formatCents,
  friendlyError,
  groupFullySelected,
  groupReceiptsByMonth,
  groupRequests,
  isSelectable,
  netAfterRefund,
  overdueSummary,
  paidThisYear,
  preselect,
  receiptItems,
  receiptSummary,
  receiptYears,
  refundState,
  selectGroup,
  separateInfo,
  sumCents,
  toggleRequest,
  type DueFilter,
  type GroupBy,
  type PayRow,
  type ReceiptItemLite,
  type ReceiptLite,
} from '@athleit/core';
import {
  cancelOpenPayment,
  createPaymentIntent,
  getCheckoutQuote,
  getHouseholdPayments,
  getHouseholdReceipts,
  getOpenPayments,
  type CheckoutQuote,
  type HouseholdPaymentRow,
  type HouseholdReceiptRow,
  type OpenPaymentRow,
} from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { H1, Notice } from '@/components/app/kit';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Icon,
  IconCircle,
  LoadingSkeleton,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/components/ui';
import { StripePay } from '@/lib/stripe-pay';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';

type Step =
  | { kind: 'review' }
  | { kind: 'pay'; clientSecret: string; stripeAccountId: string }
  | { kind: 'processing'; slow: boolean }
  | { kind: 'done'; receipt: HouseholdReceiptRow | null }
  | { kind: 'error'; message: string; again: boolean };

const POLL_MS = 2000;
const POLL_TRIES = 30;

const failureText = (code?: string) =>
  code === 'Failed'
    ? 'The payment didn’t go through. Your card was not charged.'
    : code === 'not_configured' || code === 'unsupported'
      ? 'Payments aren’t available in this build yet.'
      : 'The payment didn’t go through. Your card was not charged.';

function Row({ k, v, quiet }: { k: React.ReactNode; v: React.ReactNode; quiet?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space[3],
        minHeight: componentTokens.minTarget,
      }}
    >
      {typeof k === 'string' ? <Text muted={quiet}>{k}</Text> : k}
      {v}
    </View>
  );
}

const Kicker = ({ children }: { children: string }) => (
  <Text variant="label" muted>
    {children.toUpperCase()}
  </Text>
);

/** Receipt detail: paid total, items grouped per child, fees, any refund, date and a copyable ID. */
function ReceiptCard({ r, onDone }: { r: HouseholdReceiptRow; onDone: () => void }) {
  const toast = useToast();
  const items = receiptItems(r);
  const byChild = new Map<string, ReceiptItemLite[]>();
  for (const i of items)
    byChild.set(i.player_first_name, [...(byChild.get(i.player_first_name) ?? []), i]);
  const refunded = Number(r.refunded_cents);
  const state = refundState(r);
  const { theme } = useTheme();
  return (
    <View style={{ gap: space[4] }} testID="receipt">
      <View style={{ alignItems: 'center', gap: space[2] }}>
        <View
          style={{
            width: componentTokens.emptyState.iconCircle,
            height: componentTokens.emptyState.iconCircle,
            borderRadius: radius.pill,
            backgroundColor: theme.color.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessible={false}
        >
          <Icon name="check" size="xl" weight="fill" color={theme.color.accentInk} />
        </View>
        <Text variant="title">{state === 'full' ? 'Refunded' : 'Paid'}</Text>
        <Amount cents={r.total_charged_cents} variant="monoXl" label="Total paid" />
        {refunded > 0 ? <Text muted>Net {formatCents(netAfterRefund(r))} after refund</Text> : null}
      </View>
      {[...byChild].map(([child, list]) => (
        <View key={child}>
          <Kicker>{child || 'Items'}</Kicker>
          {list.map((i) => (
            <Row key={i.display_id} k={i.title} v={<Amount cents={i.amount_cents} />} />
          ))}
        </View>
      ))}
      <View>
        {r.platform_fee_cents > 0 ? (
          <Row quiet k="Athleit charge" v={<Amount cents={r.platform_fee_cents} />} />
        ) : null}
        {r.processing_fee_passthrough_cents > 0 ? (
          <Row quiet k="Service fee" v={<Amount cents={r.processing_fee_passthrough_cents} />} />
        ) : null}
        {refunded > 0 ? (
          <Row
            k={state === 'full' ? 'Refunded' : 'Partially refunded'}
            v={<Text variant="mono">−{formatCents(refunded)}</Text>}
          />
        ) : null}
        <Row
          quiet
          k="Date"
          v={<Text variant="bodyBold">{r.succeeded_at ? dueText(r.succeeded_at) : ''}</Text>}
        />
        <Row
          quiet
          k="Receipt ID"
          v={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Copy receipt ID ${r.receipt_display_id}`}
              onPress={() =>
                void Clipboard.setStringAsync(r.receipt_display_id).then(() =>
                  toast('Receipt ID copied'),
                )
              }
              style={{
                minHeight: componentTokens.minTarget,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[2],
              }}
            >
              <Text variant="mono">{r.receipt_display_id}</Text>
              <Icon name="copy" size="sm" />
            </Pressable>
          }
        />
      </View>
      <Button title="Done" size="lg" onPress={onDone} />
    </View>
  );
}

/** Review sheet (server-computed lines) -> PaymentSheet -> Processing until the webhook confirms -> receipt. */
function Checkout({
  ids,
  rows,
  onClose,
  onFinished,
}: {
  ids: string[];
  rows: readonly PayRow[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'review' });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const polling = useRef(false);
  // The payment opened at the server, so it can be let go if the parent leaves before entering a card.
  const paymentId = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    void getCheckoutQuote(supabase, ids).then((r) => {
      if (!live) return;
      setLoading(false);
      if (r.error) setStep({ kind: 'error', message: friendlyError(r.error), again: false });
      else setQuote(r.data);
    });
    return () => {
      live = false;
    };
  }, [ids]);

  const wait = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    setStep({ kind: 'processing', slow: false });
    for (let i = 0; i < POLL_TRIES; i++) {
      const [pay, rec] = await Promise.all([
        getHouseholdPayments(supabase),
        getHouseholdReceipts(supabase),
      ]);
      const rows = (pay.data ?? []).filter((r) => ids.includes(r.request_id));
      if (
        rows.length === ids.length &&
        rows.every((r) => r.status === 'paid' || r.status === 'partially_refunded')
      ) {
        const receipt =
          (rec.data ?? []).find((x) =>
            (x.items as unknown as { display_id: string }[]).some((it) =>
              rows.some((r) => r.display_id === it.display_id),
            ),
          ) ?? null;
        polling.current = false;
        setStep({ kind: 'done', receipt });
        onFinished();
        return;
      }
      if (i === 9) setStep({ kind: 'processing', slow: true });
      await new Promise<void>((res) => setTimeout(() => res(), POLL_MS));
    }
    polling.current = false;
    setStep({ kind: 'processing', slow: true });
  }, [ids, onFinished]);

  const start = async () => {
    setStarting(true);
    const r = await createPaymentIntent(supabase, ids);
    setStarting(false);
    if (r.error) return setStep({ kind: 'error', message: friendlyError(r.error), again: false });
    paymentId.current = r.data.paymentId;
    if (r.data.status === 'succeeded' || !r.data.clientSecret) return void wait();
    setStep({
      kind: 'pay',
      clientSecret: r.data.clientSecret,
      stripeAccountId: r.data.stripeAccountId,
    });
  };

  const onResult = useCallback(
    (res: { status: 'completed' | 'canceled' | 'failed'; code?: string }) => {
      if (res.status === 'completed') void wait();
      else if (res.status === 'canceled') setStep({ kind: 'review' });
      else setStep({ kind: 'error', message: failureText(res.code), again: true });
    },
    [wait],
  );

  const leave = () => {
    polling.current = false;
    // Leaving before a card was confirmed frees the requests. The server only cancels a payment with no confirmed
    // card, so a payment already in flight is never touched.
    const unfinished =
      step.kind === 'review' || step.kind === 'pay' || (step.kind === 'error' && step.again);
    if (unfinished && paymentId.current) {
      void cancelOpenPayment(supabase, paymentId.current).finally(onFinished);
    }
    onClose();
  };
  const at =
    step.kind === 'done'
      ? 3
      : step.kind === 'review' || step.kind === 'pay'
        ? step.kind === 'review'
          ? 0
          : 1
        : step.kind === 'error'
          ? step.again
            ? 1
            : 0
          : 2;
  const byId = new Map(rows.map((r) => [r.request_id, r]));
  const groups = new Map<string, NonNullable<typeof quote>['lines']>();
  for (const l of quote?.lines ?? []) {
    if (l.kind !== 'item') continue;
    const child = (l.request_id && byId.get(l.request_id)?.player_first_name) || '';
    groups.set(child, [...(groups.get(child) ?? []), l]);
  }
  const extras = (quote?.lines ?? []).filter((l) => l.kind !== 'item');
  return (
    <Sheet open onClose={leave} title="Checkout" level="modal">
      <View style={{ gap: space[4] }}>
        <Text variant="heading">Checkout</Text>
        <View accessibilityLabel="Checkout steps" style={{ flexDirection: 'row', gap: space[3] }}>
          {['Review', 'Pay', 'Done'].map((label, i) => (
            <Text key={label} variant="caption" muted={i !== at}>
              {i < at ? '✓ ' : `${i + 1} `}
              {label}
            </Text>
          ))}
        </View>
        {step.kind === 'review' || step.kind === 'pay' ? (
          <>
            {loading ? <Text muted>Loading…</Text> : null}
            {quote ? (
              <>
                {[...groups].map(([child, lines]) => (
                  <View key={child}>
                    <Kicker>{child || 'Items'}</Kicker>
                    {lines.map((l, i) => (
                      <Row
                        key={`${l.kind}-${i}`}
                        k={l.label}
                        v={<Amount cents={l.amount_cents} />}
                      />
                    ))}
                  </View>
                ))}
                <View>
                  {extras.map((l, i) => (
                    <Row
                      quiet
                      key={`${l.kind}-${i}`}
                      k={l.label}
                      v={<Amount cents={l.amount_cents} />}
                    />
                  ))}
                  <Row
                    k="Total"
                    v={<Amount cents={quote.total_cents} variant="monoLg" label="Total" />}
                  />
                </View>
                <Button
                  title="Continue to payment"
                  icon="arrow-right"
                  size="lg"
                  loading={starting}
                  onPress={start}
                  testID="continue-to-payment"
                />
              </>
            ) : null}
          </>
        ) : null}
        {step.kind === 'pay' ? (
          <StripePay
            clientSecret={step.clientSecret}
            stripeAccountId={step.stripeAccountId}
            onResult={onResult}
          />
        ) : null}
        {step.kind === 'error' ? (
          <View style={{ alignItems: 'center', gap: space[3] }} testID="pay-error">
            <IconCircle>
              <Icon name="warning-circle" />
            </IconCircle>
            <Text variant="heading">That didn’t go through</Text>
            <Notice tone="error">{step.message}</Notice>
            <Button
              title={step.again ? 'Try again' : 'Close'}
              icon={step.again ? 'arrow-clockwise' : undefined}
              size="lg"
              onPress={step.again ? () => void start() : leave}
            />
            {step.again ? <Button title="Close" variant="secondary" onPress={leave} /> : null}
          </View>
        ) : null}
        {step.kind === 'processing' ? (
          <View
            style={{ alignItems: 'center', gap: space[3] }}
            testID="processing"
            accessibilityLiveRegion="polite"
          >
            <Text variant="heading">
              {step.slow ? 'This is taking longer than usual' : 'Confirming your payment'}
            </Text>
            <Text muted style={{ textAlign: 'center' }}>
              {step.slow
                ? 'This is taking longer than usual. You can close this: we’ll send your receipt as soon as the payment is confirmed. You won’t be charged twice.'
                : 'Waiting for confirmation…'}
            </Text>
            {step.slow ? <Button title="Close" variant="secondary" onPress={leave} /> : null}
          </View>
        ) : null}
        {step.kind === 'done' ? (
          step.receipt ? (
            <ReceiptCard r={step.receipt} onDone={leave} />
          ) : (
            <View style={{ alignItems: 'center', gap: space[3] }}>
              <Text variant="title">Paid</Text>
              <Text muted>Your receipt will be in Receipts shortly.</Text>
              <Button title="Done" size="lg" onPress={leave} />
            </View>
          )
        ) : null}
      </View>
    </Sheet>
  );
}

const PILL: Record<string, { icon: Parameters<typeof Icon>[0]['name'] }> = {
  overdue: { icon: 'warning' },
  today: { icon: 'clock' },
  soon: { icon: 'clock' },
  later: { icon: 'calendar-blank' },
  processing: { icon: 'hourglass' },
  paid: { icon: 'check-circle' },
  refunded: { icon: 'arrow-bend-up-left' },
  closed: { icon: 'minus-circle' },
};

/** Parent Pay: Due (grouped requests) and Receipts (month-grouped). Amounts are displayed only; the server quotes the total. */
export function PayScreen({ embedded = false }: { embedded?: boolean }) {
  const { request } = useLocalSearchParams<{ request?: string }>();
  const [tab, setTab] = useState<'due' | 'receipts'>('due');
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const due = useLoad(() => getHouseholdPayments(supabase), []);
  const receipts = useLoad(() => getHouseholdReceipts(supabase), []);
  const open = useLoad(() => getOpenPayments(supabase), []);
  return (
    <View style={{ gap: space[4] }}>
      {embedded ? null : <H1>Pay</H1>}
      <SegmentedControl
        label="Pay sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'due', label: 'Due' },
          { value: 'receipts', label: 'Receipts' },
        ]}
      />
      {tab === 'due' ? (
        <DueTab
          data={due.data}
          open={open.data ?? []}
          onChanged={() => {
            due.reload();
            open.reload();
          }}
          loading={due.loading}
          error={due.error}
          onRetry={due.reload}
          linked={request ?? null}
          onPay={setCheckout}
          onReceipts={() => setTab('receipts')}
        />
      ) : (
        <ReceiptsTab
          data={receipts.data}
          loading={receipts.loading}
          error={receipts.error}
          onRetry={receipts.reload}
        />
      )}
      {checkout ? (
        <Checkout
          ids={checkout}
          rows={(due.data ?? []) as unknown as PayRow[]}
          onClose={() => {
            setCheckout(null);
            due.reload();
            open.reload();
          }}
          onFinished={() => {
            due.reload();
            receipts.reload();
            open.reload();
          }}
        />
      ) : null}
    </View>
  );
}

function DueTab({
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
  const rows = (data ?? []) as unknown as PayRow[];
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [pickedFilter, setFilter] = useState<DueFilter | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const toast = useToast();
  const [by, setBy] = useState<GroupBy>('child');
  const [closed, setClosed] = useState<Record<string, boolean>>({});

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
  if (counts.needs === 0 && counts.processing === 0)
    return (
      <EmptyState
        icon="check"
        title="You’re all paid up"
        body="Nothing is due. Your receipts are saved."
        action={
          <Button title="View receipts" variant="secondary" icon="receipt" onPress={onReceipts} />
        }
      />
    );

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
    by,
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
            <Text variant="bodyBold">Payment not finished</Text>
            <Text muted>
              {titles.join(', ') || 'A payment'} was started but not paid. Nothing was charged.
              Cancel it to pay these again.
            </Text>
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
        <Text variant="caption" muted>
          {chosen.length} of {payable.length} {payable.length === 1 ? 'request' : 'requests'}{' '}
          selected
          {sep.mixed && sep.next
            ? ` · ${sep.next.titles.join(', ')} paid separately`
            : linked && chosen.length === 1 && picked === null
              ? ' · opened from a payment link'
              : week > 0
                ? ` · ${week} due this week`
                : ''}
        </Text>
        {over.count > 0 && over.oldest ? (
          <Notice tone="error">
            {over.count} overdue · Oldest: {over.oldest.title} for {over.oldest.player},{' '}
            {over.oldest.days} {over.oldest.days === 1 ? 'day' : 'days'} late
          </Notice>
        ) : null}
      </Card>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text variant="caption" muted>
          Group by
        </Text>
        <SegmentedControl
          label="Group by"
          value={by}
          onChange={setBy}
          options={[
            { value: 'child', label: 'Child' },
            { value: 'team', label: 'Team' },
          ]}
        />
      </View>
      {filter === 'needs' && sep.mixed && sep.next ? (
        <Notice>
          These are paid separately. Pay one group at a time. {sep.next.titles.join(', ')} goes to{' '}
          {sep.next.payee}, so it is next.
        </Notice>
      ) : null}
      {groups.map((g) => {
        const open = !closed[g.key];
        const full = groupFullySelected(selected, g.rows);
        return (
          <View key={g.key} style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${g.label}, ${g.rows.length} requests`}
                onPress={() => setClosed((x) => ({ ...x, [g.key]: open }))}
                style={{
                  flex: 1,
                  minHeight: componentTokens.minTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                }}
              >
                <Text variant="bodyBold" style={{ flex: 1 }}>
                  {g.label} · {g.rows.length}
                </Text>
                <Amount cents={g.cents} />
                <Icon name={open ? 'caret-up' : 'caret-down'} size="sm" color={c.muted} />
              </Pressable>
              {filter === 'needs' && g.rows.some(isSelectable) ? (
                <Chip
                  label={full ? 'Clear' : 'Select all'}
                  onPress={() =>
                    setPicked(full ? clearGroup(selected, g.rows) : selectGroup(selected, g.rows))
                  }
                />
              ) : null}
            </View>
            {open
              ? g.rows.map((r) => {
                  const can = isSelectable(r);
                  const on = selected.has(r.request_id);
                  const st = dueState(r);
                  return (
                    <Pressable
                      key={r.request_id}
                      disabled={!can}
                      onPress={() => setPicked(toggleRequest(selected, rows, r.request_id))}
                      accessibilityRole={can ? 'checkbox' : undefined}
                      accessibilityState={can ? { checked: on } : {}}
                      accessibilityLabel={`${r.title}, ${formatCents(r.amount_cents)}, ${dueLabel(r)}`}
                      style={{
                        minHeight: componentTokens.minTarget,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[3],
                        padding: space[4],
                        borderRadius: radius.xl,
                        borderWidth: 1,
                        borderColor: c.line,
                        backgroundColor: can ? c.surface : 'transparent',
                      }}
                    >
                      {can ? (
                        <Icon
                          name={on ? 'check-circle' : 'circle-dashed'}
                          weight={on ? 'fill' : 'regular'}
                        />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyBold" muted={!can}>
                          {r.title}
                        </Text>
                        <Text variant="caption" muted>
                          {by === 'child' ? r.issuer_name : r.player_first_name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
                          <Icon
                            name={PILL[st.kind]!.icon}
                            size="sm"
                            weight="fill"
                            color={
                              st.kind === 'overdue' ? c.bad : st.kind === 'paid' ? c.ok : c.warn
                            }
                          />
                          <Text variant="caption" muted>
                            {unfinished.has(r.request_id) ? 'Not finished' : dueLabel(r)}
                          </Text>
                        </View>
                      </View>
                      <Amount cents={r.amount_cents} />
                    </Pressable>
                  );
                })
              : null}
          </View>
        );
      })}
      <Card style={{ gap: space[3] }}>
        <Row
          k={`${chosen.length} selected`}
          v={<Amount cents={total} variant="monoLg" label="Total" />}
        />
        <Text variant="caption" muted>
          Athleit charge and service fee are added at checkout.
        </Text>
        <Button
          title={`Pay ${formatCents(total)}`}
          icon="lock-simple"
          size="lg"
          disabled={chosen.length === 0}
          onPress={() => onPay(chosen.map((r) => r.request_id))}
          testID="pay-button"
        />
        {sep.mixed && sep.next ? (
          <Text variant="caption" muted>
            Pay next: {sep.next.payee} · {formatCents(sep.next.cents)}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

function ReceiptsTab({
  data,
  loading,
  error,
  onRetry,
}: {
  data: readonly HouseholdReceiptRow[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const rows = (data ?? []) as unknown as (HouseholdReceiptRow & ReceiptLite)[];
  const years = receiptYears(rows);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<HouseholdReceiptRow | null>(null);
  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <ErrorState
        message="Can’t load receipts. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  if (rows.length === 0)
    return (
      <EmptyState
        icon="receipt"
        title="No receipts yet"
        body="They’ll show up here after your first payment."
      />
    );
  const sum = paidThisYear(rows, year);
  const groups = groupReceiptsByMonth(rows, year, search);
  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[2] }}>
        <Kicker>Paid this year</Kicker>
        <Amount cents={sum.cents} variant="monoXl" label="Paid this year" />
        <Text variant="caption" muted>
          {sum.count} {sum.count === 1 ? 'receipt' : 'receipts'}
          {sum.refunded > 0 ? ` · ${formatCents(sum.refunded)} refunded` : ''}
        </Text>
      </Card>
      <TextField
        label="Search receipts"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        placeholder="Child, item or receipt ID"
      />
      {years.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2] }}
        >
          {years.map((y) => (
            <Chip key={y} label={String(y)} selected={y === year} onPress={() => setYear(y)} />
          ))}
        </ScrollView>
      ) : null}
      {groups.length === 0 ? <Text muted>No receipts match.</Text> : null}
      {groups.map((g) => (
        <View key={g.key} style={{ gap: space[2] }}>
          <Kicker>{g.label}</Kicker>
          {g.rows.map((r) => {
            const rs = refundState(r);
            return (
              <Pressable
                key={r.payment_id}
                onPress={() => setOpen(r)}
                accessibilityRole="button"
                accessibilityLabel={`Receipt ${r.receipt_display_id}, ${receiptSummary(r)}`}
                style={{
                  minHeight: componentTokens.minTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  padding: space[4],
                  borderRadius: radius.xl,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="monoSm" muted>
                    {r.receipt_display_id}
                  </Text>
                  <Text variant="bodyBold" numberOfLines={1}>
                    {receiptSummary(r)}
                  </Text>
                  <Text variant="caption" muted>
                    {r.succeeded_at ? dueText(r.succeeded_at) : ''}
                    {rs !== 'none' ? ` · ${rs === 'full' ? 'Refunded' : 'Partially refunded'}` : ''}
                  </Text>
                </View>
                <Amount cents={r.total_charged_cents} />
              </Pressable>
            );
          })}
        </View>
      ))}
      {open ? (
        <Sheet open onClose={() => setOpen(null)} title="Receipt">
          <ReceiptCard r={open} onDone={() => setOpen(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

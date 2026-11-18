import {
  formatCents,
  friendlyError,
  paymentRequestStatusLabel,
  sumCents,
  type PaymentRequestStatus,
} from '@athleit/core';
import {
  createPaymentIntent,
  getCheckoutQuote,
  getHouseholdPayments,
  getHouseholdReceipts,
  type CheckoutQuote,
  type HouseholdReceiptRow,
} from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { H1, LoadState, Notice } from '@/components/app/kit';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconCircle,
  SegmentedControl,
  Sheet,
  Text,
  useTheme,
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

function ReceiptCard({ r, onDone }: { r: HouseholdReceiptRow; onDone: () => void }) {
  const items = (r.items ?? []) as unknown as {
    display_id: string;
    title: string;
    player_first_name: string;
    amount_cents: number;
  }[];
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space[4] }} testID="receipt">
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
        <Icon name="check" size="xl" weight="fill" />
      </View>
      <Text variant="title">Paid</Text>
      <Amount cents={r.total_charged_cents} variant="monoXl" label="Total paid" />
      <Card>
        {items.map((i) => (
          <Row
            key={i.display_id}
            k={`${i.title} · ${i.player_first_name}`}
            v={<Amount cents={i.amount_cents} />}
          />
        ))}
        {r.platform_fee_cents > 0 ? (
          <Row k="Athleit charge" v={<Amount cents={r.platform_fee_cents} />} />
        ) : null}
        {r.processing_fee_passthrough_cents > 0 ? (
          <Row k="Service fee" v={<Amount cents={r.processing_fee_passthrough_cents} />} />
        ) : null}
        <Row
          k="Date"
          v={<Text variant="bodyBold">{r.succeeded_at ? dueText(r.succeeded_at) : ''}</Text>}
        />
        <Row k="Receipt ID" v={<Text variant="mono">{r.receipt_display_id}</Text>} />
      </Card>
      <Button title="Done" size="lg" onPress={onDone} />
    </View>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 44,
      }}
    >
      <Text muted>{k}</Text>
      {v}
    </View>
  );
}

/** Review sheet (server-computed lines) -> PaymentSheet -> Processing until the webhook confirms -> receipt. */
function Checkout({
  ids,
  onClose,
  onFinished,
}: {
  ids: string[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'review' });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const polling = useRef(false);

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

  return (
    <Sheet open onClose={onClose} title="Confirm payment" level="modal">
      <View style={{ gap: space[4] }}>
        {step.kind === 'review' || step.kind === 'pay' ? (
          <>
            <Text variant="heading">Confirm payment</Text>
            {loading ? <Text muted>Loading…</Text> : null}
            {quote ? (
              <>
                {quote.lines.map((l, i) => (
                  <Row
                    key={`${l.kind}-${i}`}
                    k={`${l.label}${l.display_id ? ` · ${l.display_id}` : ''}`}
                    v={<Amount cents={l.amount_cents} />}
                  />
                ))}
                <Row
                  k="Total"
                  v={<Amount cents={quote.total_cents} variant="monoLg" label="Total" />}
                />
                <Button
                  title="Continue to payment"
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
            <Text variant="heading">Payment didn’t go through</Text>
            <Notice tone="error">{step.message}</Notice>
            <Button
              title={step.again ? 'Try again' : 'Close'}
              size="lg"
              onPress={step.again ? () => void start() : onClose}
            />
          </View>
        ) : null}
        {step.kind === 'processing' ? (
          <View
            style={{ alignItems: 'center', gap: space[3] }}
            testID="processing"
            accessibilityLiveRegion="polite"
          >
            <Text variant="heading">Processing</Text>
            <Text muted style={{ textAlign: 'center' }}>
              {step.slow
                ? 'This is taking longer than usual. You can close this: we’ll send your receipt as soon as the payment is confirmed. You won’t be charged twice.'
                : 'Waiting for confirmation…'}
            </Text>
            {step.slow ? <Button title="Close" variant="secondary" onPress={onClose} /> : null}
          </View>
        ) : null}
        {step.kind === 'done' ? (
          step.receipt ? (
            <ReceiptCard r={step.receipt} onDone={onClose} />
          ) : (
            <View style={{ alignItems: 'center', gap: space[3] }}>
              <Text variant="title">Paid</Text>
              <Text muted>Your receipt will be in Receipts shortly.</Text>
              <Button title="Done" size="lg" onPress={onClose} />
            </View>
          )
        ) : null}
      </View>
    </Sheet>
  );
}

/** Parent Pay: "Amount due" over a 56px mono total, request cards, a lime Pay pill; Receipts tab. */
export function PayScreen() {
  const { request } = useLocalSearchParams<{ request?: string }>();
  const { theme } = useTheme();
  const [tab, setTab] = useState<'due' | 'receipts'>('due');
  const [picked, setPicked] = useState<Set<string> | null>(request ? new Set([request]) : null);
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const [receipt, setReceipt] = useState<HouseholdReceiptRow | null>(null);
  const due = useLoad(() => getHouseholdPayments(supabase), []);
  const receipts = useLoad(() => getHouseholdReceipts(supabase), []);
  const rows = due.data ?? [];
  const payable = rows.filter((r) => r.can_pay);
  const selected = picked ?? new Set(payable.map((r) => r.request_id));
  const chosen = payable.filter((r) => selected.has(r.request_id));
  const total = sumCents(chosen.map((r) => r.amount_cents));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };

  return (
    <View style={{ gap: space[4] }}>
      <H1>Pay</H1>
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
        <LoadState
          loading={due.loading}
          error={due.error}
          empty={rows.length === 0}
          emptyText="Nothing to pay"
          onRetry={due.reload}
        >
          <View>
            <Text variant="bodyBold" muted>
              Amount due
            </Text>
            <Amount cents={total} variant="monoXl" label="Amount due" />
          </View>
          {rows.map((r) => {
            const can = r.can_pay;
            const on = selected.has(r.request_id);
            return (
              <Pressable
                key={r.request_id}
                disabled={!can}
                onPress={() => toggle(r.request_id)}
                accessibilityRole={can ? 'checkbox' : undefined}
                accessibilityState={can ? { checked: on } : {}}
                accessibilityLabel={`${r.title}, ${formatCents(r.amount_cents)}, due ${dueText(r.due_at)}, ${paymentRequestStatusLabel(r.status as PaymentRequestStatus)}`}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  padding: space[4],
                  borderRadius: radius.xl,
                  backgroundColor: theme.color.surface,
                  borderWidth: 1,
                  borderColor: theme.color.line,
                }}
              >
                {can ? (
                  <Icon name={on ? 'check-circle' : 'x-circle'} weight={on ? 'fill' : 'regular'} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{r.title}</Text>
                  <Text variant="caption" muted>
                    {r.player_first_name} · due {dueText(r.due_at)}
                  </Text>
                </View>
                {!can ? (
                  <Badge
                    tone={
                      r.status === 'unpaid' || r.status === 'processing' ? 'warning' : 'success'
                    }
                  >
                    {paymentRequestStatusLabel(r.status as PaymentRequestStatus)}
                  </Badge>
                ) : null}
                <Amount cents={r.amount_cents} />
              </Pressable>
            );
          })}
          {chosen.length > 0 ? (
            <Button
              title={`Pay ${formatCents(total)}`}
              size="lg"
              onPress={() => setCheckout(chosen.map((r) => r.request_id))}
              testID="pay-button"
            />
          ) : null}
        </LoadState>
      ) : (
        <LoadState
          loading={receipts.loading}
          error={receipts.error}
          empty={(receipts.data ?? []).length === 0}
          emptyText="No receipts yet"
          onRetry={receipts.reload}
        >
          {(receipts.data ?? []).map((r) => (
            <Pressable
              key={r.payment_id}
              onPress={() => setReceipt(r)}
              accessibilityRole="button"
              accessibilityLabel={`Receipt ${r.receipt_display_id}`}
              style={{
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                padding: space[4],
                borderRadius: radius.xl,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.line,
              }}
            >
              <Icon name="receipt" />
              <View style={{ flex: 1 }}>
                <Text variant="mono">{r.receipt_display_id}</Text>
                <Text variant="caption" muted>
                  {r.succeeded_at ? dueText(r.succeeded_at) : ''}
                </Text>
              </View>
              <Amount cents={r.total_charged_cents} />
            </Pressable>
          ))}
        </LoadState>
      )}
      {checkout ? (
        <Checkout
          ids={checkout}
          onClose={() => setCheckout(null)}
          onFinished={() => {
            due.reload();
            receipts.reload();
            setPicked(null);
          }}
        />
      ) : null}
      {receipt ? (
        <Sheet open onClose={() => setReceipt(null)} title="Receipt">
          <ReceiptCard r={receipt} onDone={() => setReceipt(null)} />
        </Sheet>
      ) : null}
    </View>
  );
}

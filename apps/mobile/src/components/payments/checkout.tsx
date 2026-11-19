import { friendlyError, type PayRow } from '@athleit/core';
import {
  cancelOpenPayment,
  createPaymentIntent,
  getCheckoutQuote,
  getHouseholdPayments,
  getHouseholdReceipts,
  type CheckoutQuote,
  type HouseholdReceiptRow,
} from '@athleit/db/payments';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Notice } from '@/components/app/kit';
import { Button, Icon, IconButton, IconCircle, Sheet, Text, useTheme } from '@/components/ui';
import { StripePay } from '@/lib/stripe-pay';
import { supabase } from '@/lib/supabase';

import { Amount } from './money';
import { Kicker, Row } from './pay-parts';
import { ReceiptCard } from './receipt-card';

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

/** Review sheet (server-computed lines) -> PaymentSheet -> Processing until the webhook confirms -> receipt. */
export function Checkout({
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
  const { theme } = useTheme();
  const c = theme.color;
  const [showReceipt, setShowReceipt] = useState(false);
  const at =
    step.kind === 'done'
      ? 3
      : step.kind === 'review'
        ? 0
        : step.kind === 'pay'
          ? 1
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
  const payee = rows.find((r) => ids.includes(r.request_id))?.issuer_name;

  return (
    <Sheet open onClose={leave} title="Checkout" level="modal">
      <View style={{ gap: space[4] }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text variant="heading" accessibilityRole="header">
            Checkout
          </Text>
          <IconButton icon="x" label="Close checkout" onPress={leave} />
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${Math.min(at + 1, 3)} of 3`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}
        >
          {['Review', 'Pay', 'Done'].map((label, i) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View
                style={{
                  width: space[6],
                  height: space[6],
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: i < at ? c.accent : c.surfaceAlt,
                }}
              >
                {i < at ? (
                  <Icon name="check" size="sm" color={c.accentInk} />
                ) : (
                  <Text variant="monoSm" style={{ color: i === at ? c.ink : c.muted }}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text variant="caption" muted={i !== at}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {step.kind === 'review' || step.kind === 'pay' ? (
          <>
            {loading ? (
              <Text muted accessibilityLiveRegion="polite">
                Loading…
              </Text>
            ) : null}
            {step.kind === 'review' && quote ? (
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
                    k={<Text variant="bodyBold">Total</Text>}
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
            {step.kind === 'pay' && quote ? (
              <>
                <Row
                  k={<Text muted>Paying {payee ?? 'your team'}</Text>}
                  v={<Amount cents={quote.total_cents} variant="monoLg" label="Total" />}
                />
                <Text variant="caption" muted>
                  A secure Stripe sheet opens to finish paying. Apple Pay, Google Pay and cards are
                  supported.
                </Text>
                <StripePay
                  clientSecret={step.clientSecret}
                  stripeAccountId={step.stripeAccountId}
                  onResult={onResult}
                />
              </>
            ) : null}
          </>
        ) : null}

        {step.kind === 'error' ? (
          <View style={{ alignItems: 'center', gap: space[3] }} testID="pay-error">
            <IconCircle>
              <Icon name="warning-circle" color={c.bad} />
            </IconCircle>
            <Text variant="heading">That didn’t go through</Text>
            <Notice tone="error">{step.message}</Notice>
            {step.again ? (
              <Button
                title="Try again"
                icon="arrow-clockwise"
                size="lg"
                onPress={() => void start()}
              />
            ) : null}
            <Button title="Close" variant={step.again ? 'secondary' : 'primary'} onPress={leave} />
          </View>
        ) : null}

        {step.kind === 'processing' ? (
          <View
            style={{ alignItems: 'center', gap: space[3] }}
            testID="processing"
            accessibilityLiveRegion="polite"
          >
            {step.slow ? null : <ActivityIndicator color={c.ink} />}
            <Text variant="heading" style={{ textAlign: 'center' }}>
              {step.slow ? 'This is taking longer than usual' : 'Confirming your payment'}
            </Text>
            <Text muted style={{ textAlign: 'center' }}>
              {step.slow
                ? 'You can close this. We’ll send your receipt as soon as the payment is confirmed. You won’t be charged twice.'
                : 'This usually takes a few seconds. Please keep this open.'}
            </Text>
            {step.slow ? <Button title="Close" variant="secondary" onPress={leave} /> : null}
          </View>
        ) : null}

        {step.kind === 'done' ? (
          step.receipt && showReceipt ? (
            <ReceiptCard r={step.receipt} onDone={leave} thanks />
          ) : (
            <View style={{ alignItems: 'center', gap: space[3] }}>
              <View
                style={{
                  width: componentTokens.emptyState.iconCircle,
                  height: componentTokens.emptyState.iconCircle,
                  borderRadius: radius.pill,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                accessible={false}
              >
                <Icon name="check" size="xl" weight="fill" color={c.accentInk} />
              </View>
              <Text variant="title">Paid</Text>
              <Text muted style={{ textAlign: 'center' }}>
                {step.receipt
                  ? 'Thanks. A receipt was emailed to you.'
                  : 'Your receipt will be in Receipts shortly.'}
              </Text>
              {step.receipt ? (
                <Amount
                  cents={step.receipt.total_charged_cents}
                  variant="monoXl"
                  label="Total paid"
                />
              ) : null}
              {step.receipt ? (
                <Button
                  title="View receipt"
                  icon="receipt"
                  variant="secondary"
                  onPress={() => setShowReceipt(true)}
                />
              ) : null}
              <Button title="Done" size="lg" onPress={leave} />
            </View>
          )
        ) : null}
      </View>
    </Sheet>
  );
}

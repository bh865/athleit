'use client';

import { friendlyError, formatCents } from '@athleit/core';
import {
  createPaymentIntent,
  getCheckoutQuote,
  getHouseholdPayments,
  getHouseholdReceipts,
  type CheckoutQuote,
  type HouseholdReceiptRow,
} from '@athleit/db/payments';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Icon, Sheet, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { stripeAppearance } from './appearance';
import { Amount } from './money';
import styles from './payments.module.css';
import { ReceiptView } from './receipt';

type Step =
  | { kind: 'review' }
  | { kind: 'pay'; clientSecret: string; stripe: Promise<Stripe | null> }
  | { kind: 'processing'; slow: boolean }
  | { kind: 'done'; receipt: HouseholdReceiptRow | null }
  | { kind: 'error'; message: string; retry: 'review' | 'pay' };

const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const POLL_MS = 2000;
const POLL_TRIES = 30;

/** Plain-language messages. The client success screen is only a hint: the receipt waits for the webhook. */
export function paymentErrorMessage(
  e: { type?: string; code?: string; decline_code?: string } | undefined,
): string {
  if (!e) return 'The payment didn’t go through. Your card was not charged.';
  if (e.code === 'card_declined' || e.type === 'card_error')
    return 'Your card was declined. You were not charged. Try another card.';
  if (e.code === 'payment_intent_authentication_failure')
    return 'We couldn’t verify your card with your bank. You were not charged. Try again.';
  if (e.type === 'api_connection_error')
    return 'The connection dropped. Check it and try again. You were not charged unless a receipt appears.';
  return 'The payment didn’t go through. Your card was not charged.';
}

function PayForm({
  onSubmitted,
  onError,
  total,
}: {
  onSubmitted: () => void;
  onError: (m: string) => void;
  total: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.stack}
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        const { error } = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: `${window.location.origin}/pay?returned=1` },
        });
        setBusy(false);
        if (error) onError(paymentErrorMessage(error));
        else onSubmitted();
      }}
    >
      <div className={styles.element}>
        <PaymentElement
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }}
        />
      </div>
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!stripe || !elements}>
        Pay {formatCents(total)}
      </Button>
    </form>
  );
}

/**
 * Review (server-computed line items) -> Stripe Payment Element -> Processing until the webhook marks the payment
 * paid -> receipt. The apps never send an amount: only request ids.
 */
function CheckoutBody({
  requestIds,
  onClose,
  onFinished,
}: {
  requestIds: string[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const open = true;
  const [step, setStep] = useState<Step>({ kind: 'review' });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [starting, setStarting] = useState(false);
  const polling = useRef(false);

  useEffect(() => {
    let live = true;
    void getCheckoutQuote(getClient(), requestIds).then((r) => {
      if (!live) return;
      setLoadingQuote(false);
      if (r.error) setStep({ kind: 'error', message: friendlyError(r.error), retry: 'review' });
      else setQuote(r.data);
    });
    return () => {
      live = false;
    };
  }, [requestIds]);

  const waitForWebhook = useCallback(
    async (ids: string[]) => {
      if (polling.current) return;
      polling.current = true;
      setStep({ kind: 'processing', slow: false });
      const client = getClient();
      for (let i = 0; i < POLL_TRIES; i++) {
        const [pay, rec] = await Promise.all([
          getHouseholdPayments(client),
          getHouseholdReceipts(client),
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
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
      polling.current = false;
      setStep({ kind: 'processing', slow: true });
    },
    [onFinished],
  );

  const start = async () => {
    setStarting(true);
    const r = await createPaymentIntent(getClient(), requestIds);
    setStarting(false);
    if (r.error)
      return setStep({ kind: 'error', message: friendlyError(r.error), retry: 'review' });
    if (r.data.status === 'succeeded' || !r.data.clientSecret)
      return void waitForWebhook(requestIds);
    if (!PUBLISHABLE) {
      return setStep({
        kind: 'error',
        message: 'Payments aren’t set up on this site yet.',
        retry: 'review',
      });
    }
    setStep({
      kind: 'pay',
      clientSecret: r.data.clientSecret,
      // Direct charge: Stripe.js must act on the team's connected account.
      stripe: loadStripe(PUBLISHABLE, { stripeAccount: r.data.stripeAccountId }),
    });
  };

  const close = () => {
    polling.current = false;
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Confirm payment" level="modal">
      {step.kind === 'review' || (step.kind === 'error' && step.retry === 'review') ? (
        <div className={styles.stack}>
          <Text variant="heading" as="h2">
            Confirm payment
          </Text>
          {step.kind === 'error' ? (
            <p role="alert" className={`${styles.notice} ${styles.noticeBad}`}>
              {step.message}
            </p>
          ) : null}
          {loadingQuote ? <Text muted>Loading…</Text> : null}
          {quote ? (
            <>
              <div className={styles.lines} data-testid="quote-lines">
                {quote.lines.map((l, i) => (
                  <div key={`${l.kind}-${i}`} className={styles.line}>
                    <Text muted>
                      {l.label}
                      {l.display_id ? ` · ${l.display_id}` : ''}
                    </Text>
                    <Amount cents={l.amount_cents} />
                  </div>
                ))}
                <div className={`${styles.line} ${styles.total}`}>
                  <Text variant="bodyBold">Total</Text>
                  <Amount cents={quote.total_cents} variant="monoLg" label="Total" />
                </div>
              </div>
              <Button size="lg" fullWidth loading={starting} onClick={start}>
                Continue to payment
              </Button>
            </>
          ) : step.kind === 'error' ? (
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          ) : null}
        </div>
      ) : null}

      {step.kind === 'pay' && quote ? (
        <div className={styles.stack}>
          <Text variant="heading" as="h2">
            Payment
          </Text>
          <Elements
            stripe={step.stripe}
            options={{ clientSecret: step.clientSecret, appearance: stripeAppearance() }}
          >
            <PayForm
              total={quote.total_cents}
              onSubmitted={() => void waitForWebhook(requestIds)}
              onError={(message) => setStep({ kind: 'error', message, retry: 'pay' })}
            />
          </Elements>
        </div>
      ) : null}

      {step.kind === 'error' && step.retry === 'pay' ? (
        <div className={styles.center} data-testid="pay-error">
          <span className={styles.success} aria-hidden>
            <Icon name="warning-circle" size="xl" />
          </span>
          <Text variant="heading" as="h2">
            Payment didn’t go through
          </Text>
          <Text muted as="p" role="alert">
            {step.message}
          </Text>
          <Button size="lg" fullWidth onClick={() => void start()}>
            Try again
          </Button>
        </div>
      ) : null}

      {step.kind === 'processing' ? (
        <div className={styles.center} data-testid="processing">
          <Text variant="heading" as="h2">
            Processing
          </Text>
          <Text muted as="p" role="status">
            {step.slow
              ? 'This is taking longer than usual. You can close this: we’ll send your receipt as soon as the payment is confirmed. You won’t be charged twice.'
              : 'Waiting for confirmation. Please don’t close this window.'}
          </Text>
          {step.slow ? (
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          ) : null}
        </div>
      ) : null}

      {step.kind === 'done' ? (
        step.receipt ? (
          <ReceiptView receipt={step.receipt} onDone={close} />
        ) : (
          <div className={styles.center}>
            <Text variant="title" as="h2">
              Paid
            </Text>
            <Text muted>Your receipt will be in Receipts shortly.</Text>
            <Button size="lg" fullWidth onClick={close}>
              Done
            </Button>
          </div>
        )
      ) : null}
    </Sheet>
  );
}

/** Mount per request set so every checkout starts from a clean review step. */
export function CheckoutSheet({
  requestIds,
  onClose,
  onFinished,
}: {
  requestIds: string[] | null;
  onClose: () => void;
  onFinished: () => void;
}) {
  if (!requestIds) return null;
  return (
    <CheckoutBody
      key={requestIds.join(',')}
      requestIds={requestIds}
      onClose={onClose}
      onFinished={onFinished}
    />
  );
}

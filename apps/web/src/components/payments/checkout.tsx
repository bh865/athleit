'use client';

import { friendlyError, formatCents, type PayRow } from '@athleit/core';
import {
  cancelOpenPayment,
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

import { Button, Icon, IconButton, Sheet, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { stripeAppearance } from './appearance';
import { Amount } from './money';
import styles from './parent-pay.module.css';
import { ReceiptView } from './receipt';

type Step =
  | { kind: 'review' }
  | { kind: 'pay'; clientSecret: string; stripe: Promise<Stripe | null> }
  | { kind: 'processing'; slow: boolean }
  | { kind: 'done'; receipt: HouseholdReceiptRow | null }
  | { kind: 'error'; message: string; retry: 'review' | 'pay'; cause?: ErrorCause };

type ErrorCause = 'declined' | 'bank' | 'connection' | 'generic';

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

/** Which illustration and title an error gets. The wording itself always comes from paymentErrorMessage. */
export function paymentErrorCause(e: { type?: string; code?: string } | undefined): ErrorCause {
  if (!e) return 'generic';
  if (e.code === 'card_declined' || e.type === 'card_error') return 'declined';
  if (e.code === 'payment_intent_authentication_failure') return 'bank';
  if (e.type === 'api_connection_error') return 'connection';
  return 'generic';
}
const CAUSE: Record<ErrorCause, { icon: Parameters<typeof Icon>[0]['name']; title: string }> = {
  declined: { icon: 'credit-card', title: 'Your card was declined' },
  bank: { icon: 'bank', title: 'We couldn’t verify your bank' },
  connection: { icon: 'wifi-slash', title: 'Connection lost' },
  generic: { icon: 'warning-circle', title: 'That didn’t go through' },
};

const STEPS = ['Review', 'Pay', 'Done'] as const;
/** Review / Pay / Done. The step machine below decides which one is current; this only draws it. */
function StepHeader({ at }: { at: 0 | 1 | 2 | 3 }) {
  return (
    <ol className={styles.steps} aria-label="Checkout steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`${styles.step} ${i === at ? styles.stepOn : ''}`}
          aria-current={i === at ? 'step' : undefined}
        >
          <span className={`${styles.stepDot} ${i < at ? styles.stepDone : ''}`}>
            {i < at ? <Icon name="check" size="sm" /> : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function PayForm({
  onSubmitted,
  onError,
  total,
}: {
  onSubmitted: () => void;
  onError: (m: string, cause: ErrorCause) => void;
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
        if (error) onError(paymentErrorMessage(error), paymentErrorCause(error));
        else onSubmitted();
      }}
    >
      <div className={styles.element}>
        <PaymentElement
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }}
        />
      </div>
      <Button type="submit" size="lg" fullWidth loading={busy} disabled={!stripe || !elements}>
        <Icon name="lock-simple" size="sm" /> Pay {formatCents(total)}
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
  rows,
  onClose,
  onFinished,
}: {
  requestIds: string[];
  rows: readonly PayRow[];
  onClose: () => void;
  onFinished: () => void;
}) {
  const open = true;
  const [step, setStep] = useState<Step>({ kind: 'review' });
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [starting, setStarting] = useState(false);
  const polling = useRef(false);
  // The payment opened at the server, so it can be let go if the parent leaves before entering a card.
  const paymentId = useRef<string | null>(null);

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
    paymentId.current = r.data.paymentId;
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
    // Leaving before a card was confirmed: free the requests so nothing is left "processing". The server only
    // cancels a payment that has no confirmed card, so a payment already in flight is never touched.
    const unfinished = step.kind === 'pay' || (step.kind === 'error' && step.retry === 'pay');
    if (unfinished && paymentId.current) {
      void cancelOpenPayment(getClient(), paymentId.current).finally(onFinished);
    }
    onClose();
  };

  const at: 0 | 1 | 2 | 3 =
    step.kind === 'done'
      ? 3
      : step.kind === 'review' || (step.kind === 'error' && step.retry === 'review')
        ? 0
        : step.kind === 'pay' || step.kind === 'error'
          ? 1
          : 2;
  const byId = new Map(rows.map((r) => [r.request_id, r]));
  // Server lines, grouped under the child they belong to. Amounts are the server's; this only arranges them.
  const itemGroups = new Map<string, NonNullable<typeof quote>['lines']>();
  for (const l of quote?.lines ?? []) {
    if (l.kind !== 'item') continue;
    const child = (l.request_id && byId.get(l.request_id)?.player_first_name) || '';
    itemGroups.set(child, [...(itemGroups.get(child) ?? []), l]);
  }
  const extras = (quote?.lines ?? []).filter((l) => l.kind !== 'item');
  const payee = rows.find((r) => requestIds.includes(r.request_id))?.issuer_name;

  return (
    <Sheet open={open} onClose={close} title="Checkout" level="modal" placement="side">
      <div className={styles.stack}>
        <div className={`${styles.row} ${styles.between}`}>
          <Text variant="heading" as="h2">
            Checkout
          </Text>
          <IconButton icon="x" label="Close checkout" onClick={close} />
        </div>
        <StepHeader at={at} />

        {step.kind === 'review' || (step.kind === 'error' && step.retry === 'review') ? (
          <div className={styles.stack}>
            {step.kind === 'error' ? (
              <p role="alert" className={styles.strip}>
                <Icon name="warning-circle" size="sm" /> {step.message}
              </p>
            ) : null}
            {loadingQuote ? (
              <Text muted role="status">
                Loading…
              </Text>
            ) : null}
            {quote ? (
              <>
                <div className={styles.stack} data-testid="quote-lines">
                  {[...itemGroups].map(([child, lines]) => (
                    <section key={child} className={styles.lines} aria-label={child || 'Items'}>
                      <span className={styles.kicker}>{child}</span>
                      {lines.map((l, i) => (
                        <div key={`${l.kind}-${i}`} className={styles.line}>
                          <Text>{l.label}</Text>
                          <Amount cents={l.amount_cents} />
                        </div>
                      ))}
                    </section>
                  ))}
                  <div className={styles.lines}>
                    {extras.map((l, i) => (
                      <div key={`${l.kind}-${i}`} className={`${styles.line} ${styles.lineQuiet}`}>
                        <span>{l.label}</span>
                        <Amount cents={l.amount_cents} />
                      </div>
                    ))}
                    <div className={`${styles.line} ${styles.lineTotal}`}>
                      <span>Total</span>
                      <Amount cents={quote.total_cents} variant="monoLg" label="Total" />
                    </div>
                  </div>
                </div>
                <Button size="lg" fullWidth loading={starting} onClick={start}>
                  Continue to payment <Icon name="arrow-right" size="sm" />
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
            <div className={`${styles.row} ${styles.between}`}>
              <Text muted>Paying {payee ?? 'your team'}</Text>
              <Amount cents={quote.total_cents} variant="monoLg" label="Total" />
            </div>
            <Elements
              stripe={step.stripe}
              options={{ clientSecret: step.clientSecret, appearance: stripeAppearance() }}
            >
              <PayForm
                total={quote.total_cents}
                onSubmitted={() => void waitForWebhook(requestIds)}
                onError={(message, cause) =>
                  setStep({ kind: 'error', message, retry: 'pay', cause })
                }
              />
            </Elements>
          </div>
        ) : null}

        {step.kind === 'error' && step.retry === 'pay' ? (
          <div className={styles.center} data-testid="pay-error">
            <span className={styles.bad} aria-hidden>
              <Icon name={CAUSE[step.cause ?? 'generic'].icon} size="xl" />
            </span>
            <Text variant="heading" as="h2">
              {CAUSE[step.cause ?? 'generic'].title}
            </Text>
            <Text muted as="p" role="alert">
              {step.message}
            </Text>
            <div className={styles.row}>
              <Button size="lg" onClick={() => void start()}>
                <Icon name="arrow-clockwise" size="sm" /> Try again
              </Button>
              <Button variant="secondary" size="lg" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        ) : null}

        {step.kind === 'processing' ? (
          <div className={styles.center} data-testid="processing">
            <Text variant="heading" as="h2">
              {step.slow ? 'This is taking longer than usual' : 'Confirming your payment'}
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
              <span className={styles.ok} aria-hidden>
                <Icon name="check" size="xl" weight="fill" />
              </span>
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
      </div>
    </Sheet>
  );
}

/** Mount per request set so every checkout starts from a clean review step. */
export function CheckoutSheet({
  requestIds,
  rows,
  onClose,
  onFinished,
}: {
  requestIds: string[] | null;
  rows: readonly PayRow[];
  onClose: () => void;
  onFinished: () => void;
}) {
  if (!requestIds) return null;
  return (
    <CheckoutBody
      key={requestIds.join(',')}
      requestIds={requestIds}
      rows={rows}
      onClose={onClose}
      onFinished={onFinished}
    />
  );
}

'use client';

import {
  billingBanner,
  billingDate,
  canCancel,
  canResume,
  canSubscribe,
  daysLeftLabel,
  formatCents,
  formatMonthlyPrice,
  friendlyError,
  type TeamBillingView,
} from '@athleit/core';
import {
  getBillingCard,
  getTeamBillingInvoices,
  openBillingPortal,
  startBillingCheckout,
  updateTeamSubscription,
} from '@athleit/db/billing';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Card, ConfirmSheet, Icon, Mono, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './billing.module.css';
import { useTeamBilling } from './use-team-billing';

/** Where Checkout told us the trial end was moved to Stripe's minimum (shown on the confirmation page). */
export const TRIAL_NOTE_KEY = 'athleit.billing.trialNote';

const LABEL: Record<TeamBillingView['state'], string> = {
  off: 'Not on',
  trialing: 'Free trial',
  active: 'Subscribed',
  cancel_scheduled: 'Ends soon',
  past_due: 'Payment problem',
  trial_expired: 'Trial ended',
  lapsed: 'Paused',
  comped: 'Complimentary',
};
const TONE: Record<TeamBillingView['state'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  off: 'neutral',
  trialing: 'neutral',
  active: 'success',
  cancel_scheduled: 'warning',
  past_due: 'danger',
  trial_expired: 'danger',
  lapsed: 'danger',
  comped: 'success',
};

const fact = (label: string, value: string, mono = false) => (
  <div className={styles.fact} key={label}>
    <dt>
      <Text variant="caption" muted as="span">
        {label}
      </Text>
    </dt>
    <dd>{mono ? <Mono>{value}</Mono> : <Text variant="bodyBold">{value}</Text>}</dd>
  </div>
);

const fullDate = (d: string) =>
  `${billingDate(d)}, ${new Date(d).getUTCFullYear()}`;

/**
 * Team subscription: every state for admins, a status line for coaches and managers. All numbers come from the server
 * (get_team_billing / get_billing_terms); the page never states a price or a trial length of its own.
 */
export function BillingPanel({ teamId }: { teamId: string }) {
  const { view, terms, loading, error, reload } = useTeamBilling(teamId);
  const toast = useToast();
  const [busy, setBusy] = useState<'subscribe' | 'portal' | 'cancel' | 'resume' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const now = new Date();
  const admin = !!view?.can_manage;
  const live = view && ['active', 'cancel_scheduled', 'past_due'].includes(view.state);

  const invoices = useLoad(
    async () => (admin && live ? getTeamBillingInvoices(getClient(), teamId) : { data: [], error: null }),
    [teamId, admin, live, view?.state],
  );
  const card = useLoad(
    async () =>
      admin && live ? getBillingCard(getClient(), teamId) : { data: null, error: null },
    [teamId, admin, live],
  );

  async function subscribe() {
    setBusy('subscribe');
    const r = await startBillingCheckout(getClient(), teamId);
    if (r.error) {
      setBusy(null);
      return toast(friendlyError(r.error), 'danger');
    }
    try {
      if (r.data.trialExtendedToMinimum && r.data.trialEndsAt)
        sessionStorage.setItem(
          TRIAL_NOTE_KEY,
          `Your trial had less than two days left, so your first charge is a little later than ${fullDate(r.data.trialEndsAt)}.`,
        );
    } catch {
      /* storage can be blocked; the note is a courtesy */
    }
    window.location.href = r.data.url;
  }
  async function portal() {
    setBusy('portal');
    const r = await openBillingPortal(getClient(), teamId);
    if (r.error) {
      setBusy(null);
      return toast(friendlyError(r.error), 'danger');
    }
    window.location.href = r.data.url;
  }
  async function change(action: 'cancel' | 'resume') {
    setBusy(action);
    const r = await updateTeamSubscription(getClient(), teamId, action);
    setBusy(null);
    setConfirmCancel(false);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    toast(
      action === 'cancel'
        ? `Subscription will end ${r.data.currentPeriodEnd ? fullDate(r.data.currentPeriodEnd) : 'at the end of this period'}. Everything keeps working until then.`
        : 'Subscription resumed.',
      'success',
    );
    reload();
  }

  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {!view || view.state === 'off' ? (
        <Card className={styles.panel}>
          <Text variant="body" muted>
            Team billing is not turned on.
          </Text>
        </Card>
      ) : (
        <div className={styles.stack} data-testid="billing-panel" data-state={view.state}>
          <Card className={styles.panel}>
            <div className={styles.between}>
              <div className={styles.row}>
                <Icon name="credit-card" size="lg" />
                <Text variant="heading" as="h2">
                  Subscription
                </Text>
              </div>
              <Badge tone={TONE[view.state]} data-testid="billing-status">
                {LABEL[view.state]}
              </Badge>
            </div>

            <StateBody view={view} now={now} admin={admin} />

            {view.price_mismatch && admin ? (
              <Text variant="caption" muted as="p" role="status">
                We noticed the amount on this subscription differs from the plan price. Athleit support has been flagged.
              </Text>
            ) : null}

            {admin ? (
              <div className={styles.row}>
                {canSubscribe(view.state) ? (
                  <Button loading={busy === 'subscribe'} onClick={subscribe}>
                    {view.state === 'past_due' ? 'Subscribe again' : 'Subscribe'}
                  </Button>
                ) : null}
                {view.state === 'past_due' || view.state === 'active' || view.state === 'cancel_scheduled' ? (
                  <Button
                    variant={view.state === 'past_due' ? 'primary' : 'secondary'}
                    loading={busy === 'portal'}
                    onClick={portal}
                  >
                    {view.state === 'past_due' ? 'Update payment method' : 'Manage payment method'}
                  </Button>
                ) : null}
                {canResume(view.state) ? (
                  <Button loading={busy === 'resume'} onClick={() => change('resume')}>
                    Resume subscription
                  </Button>
                ) : null}
                {canCancel(view.state) ? (
                  <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                    Cancel subscription
                  </Button>
                ) : null}
              </div>
            ) : (
              <Text variant="caption" muted as="p">
                Only a team admin can change billing.
              </Text>
            )}
            {view.state === 'trialing' && admin ? (
              <Text variant="caption" muted as="p">
                No card needed until you subscribe.
              </Text>
            ) : null}
          </Card>

          {admin && live && card.data?.last4 ? (
            <Card className={styles.panel}>
              <Text variant="bodyBold">Payment method</Text>
              <Text variant="body">
                <span style={{ textTransform: 'capitalize' }}>{card.data.brand ?? 'Card'}</span> ending in{' '}
                <Mono>{card.data.last4}</Mono>
                {card.data.expMonth && card.data.expYear ? (
                  <>
                    {' '}
                    · expires <Mono>{String(card.data.expMonth).padStart(2, '0')}/{card.data.expYear}</Mono>
                  </>
                ) : null}
              </Text>
            </Card>
          ) : null}

          {admin && live ? (
            <Card className={styles.panel}>
              <Text variant="bodyBold">Invoices</Text>
              <LoadState
                loading={invoices.loading}
                error={invoices.error}
                empty={(invoices.data ?? []).length === 0}
                emptyText="No invoices yet."
                onRetry={invoices.reload}
              >
                <ul className={styles.invoices}>
                  {(invoices.data ?? []).map((i) => (
                    <li className={styles.invoice} key={i.invoice_number ?? `${i.period_start}-${i.status}`}>
                      <div className={styles.grow}>
                        <Mono>{formatCents(i.amount_due_cents)}</Mono>{' '}
                        <Text variant="caption" muted>
                          {i.period_start ? fullDate(i.period_start) : ''}
                        </Text>
                      </div>
                      <Badge tone={i.status === 'paid' ? 'success' : i.status === 'open' ? 'warning' : 'neutral'}>
                        {i.status === 'paid' ? 'Paid' : i.status === 'open' ? 'Open' : i.status}
                      </Badge>
                      {i.hosted_invoice_url ? (
                        <a href={i.hosted_invoice_url} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : null}
                      {i.invoice_pdf_url ? (
                        <a href={i.invoice_pdf_url} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </LoadState>
            </Card>
          ) : null}
          {terms && admin && view.state === 'trialing' ? (
            <Text variant="caption" muted as="p">
              After your trial: {formatMonthlyPrice(view.price_cents ?? terms.price_cents)}, billed monthly. Cancel any time.
            </Text>
          ) : null}
        </div>
      )}
      <ConfirmSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel subscription?"
        confirmLabel="Cancel subscription"
        cancelLabel="Keep subscription"
        busy={busy === 'cancel'}
        onConfirm={() => change('cancel')}
      >
        <Text variant="body" as="p">
          {view?.current_period_end
            ? `Your team keeps full access until ${fullDate(view.current_period_end)}.`
            : 'Your team keeps full access until the end of this billing period.'}{' '}
          After that, new payment requests, registrations, invites and join approvals pause. Nothing is deleted, and
          you can subscribe again any time.
        </Text>
      </ConfirmSheet>
    </LoadState>
  );
}

function StateBody({ view, now, admin }: { view: TeamBillingView; now: Date; admin: boolean }) {
  const banner = billingBanner(view, now, [Number.MAX_SAFE_INTEGER]);
  const price = view.price_cents !== undefined ? formatMonthlyPrice(view.price_cents) : null;
  switch (view.state) {
    case 'trialing':
      return (
        <dl className={styles.facts}>
          {view.trial_ends_at ? fact('Free trial', daysLeftLabel(view.trial_ends_at, now)) : null}
          {view.trial_ends_at ? fact('Ends', fullDate(view.trial_ends_at)) : null}
          {admin && price ? fact('Then', price, true) : null}
        </dl>
      );
    case 'active':
      return (
        <dl className={styles.facts}>
          {price ? fact('Plan', price, true) : null}
          {view.current_period_end ? fact('Next charge', fullDate(view.current_period_end)) : null}
        </dl>
      );
    case 'cancel_scheduled':
      return (
        <Text variant="body" as="p">
          {view.current_period_end
            ? `Your subscription ends ${fullDate(view.current_period_end)}. Everything keeps working until then.`
            : 'Your subscription is set to end.'}
        </Text>
      );
    case 'past_due':
      return (
        <Text variant="body" as="p">
          {admin
            ? `We could not charge your card. Update it${view.grace_ends_at ? ` by ${fullDate(view.grace_ends_at)}` : ''} to keep everything on. Until then nothing is paused.`
            : 'There is a problem with the team’s subscription payment. Ask a team admin to fix it.'}
        </Text>
      );
    case 'trial_expired':
    case 'lapsed':
      return (
        <>
          <Text variant="body" as="p">
            {view.state === 'trial_expired' ? 'The free trial has ended.' : 'The subscription has ended.'}{' '}
            {banner?.body}
          </Text>
          <Text variant="caption" muted as="p">
            Still working: messages, schedule and RSVPs, editing or cancelling existing events, exports, refunds, and your
            families’ payments and registrations that are already open.
          </Text>
        </>
      );
    case 'comped':
      return (
        <Text variant="body" as="p">
          {view.comp_until
            ? `Complimentary until ${fullDate(view.comp_until)}.`
            : 'Complimentary. No payment needed.'}
        </Text>
      );
    default:
      return null;
  }
}

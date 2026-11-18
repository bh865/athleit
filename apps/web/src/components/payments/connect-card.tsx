'use client';

import { friendlyError } from '@athleit/core';
import {
  getConnectedAccountStatus,
  setDefaultFeePolicy,
  startConnectOnboarding,
  type Owner,
} from '@athleit/db/payments';
import { useState } from 'react';

import { Button, Icon, SegmentedControl, Sheet, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './payments.module.css';

type Key = 'not_started' | 'in_review' | 'needs_info' | 'ready' | 'disconnected';

/** Payout state for a team/club: Connect status plus the "go to Stripe" action. Admins can start or continue onboarding. */
export function usePayout(owner: Owner, onReadyChange?: (ready: boolean) => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = useLoad(async () => {
    const r = await getConnectedAccountStatus(getClient(), owner);
    onReadyChange?.(!!r.data?.charges_enabled);
    return r;
  }, [owner.teamId, owner.clubId]);
  const s = status.data;
  const key = (s?.exists_account ? s.onboarding_status : 'not_started') as Key;

  const go = async () => {
    setBusy(true);
    const r = await startConnectOnboarding(
      getClient(),
      owner,
      'web',
      key === 'in_review' ? 'sync' : 'link',
    );
    setBusy(false);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    if (r.data.url) window.location.href = r.data.url;
    else status.reload();
  };
  return { status, s, key, busy, go, canManage: !!s?.can_manage };
}
export type Payout = ReturnType<typeof usePayout>;

/** Header badge shown only when payouts are ready; opens payout settings (where the default fee setting lives). */
export function PayoutBadge({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={styles.pillButton}
      aria-label="Payouts · Ready, open payout settings"
      onClick={onOpen}
      data-testid="connect-card"
    >
      <span className={styles.iconOk} style={{ display: 'flex' }}>
        <Icon name="check-circle" weight="fill" size="sm" />
      </span>
      Payouts · Ready
      <span className={styles.iconMuted} style={{ display: 'flex' }}>
        <Icon name="caret-down" size="sm" />
      </span>
    </button>
  );
}

/** One-line notice for the in-between states: in review, needs info, disconnected. */
export function PayoutNotice({ payout }: { payout: Payout }) {
  const { key, canManage, busy, go } = payout;
  const copy = {
    in_review: {
      tone: 'warn',
      icon: 'hourglass',
      title: 'Payouts in review',
      body: 'We’ll notify you when payouts are ready.',
      cta: '',
    },
    needs_info: {
      tone: 'warn',
      icon: 'warning-circle',
      title: 'Payouts need more info',
      body: 'Add the missing details to turn payouts on.',
      cta: 'Add info',
    },
    disconnected: {
      tone: 'bad',
      icon: 'plugs',
      title: 'Payouts disconnected',
      body: 'Payments can’t be paid out until you reconnect.',
      cta: 'Reconnect',
    },
  }[key as 'in_review' | 'needs_info' | 'disconnected'];
  if (!copy) return null;
  const warn = copy.tone === 'warn';
  return (
    <div
      className={styles.banner}
      data-testid="connect-card"
      style={{ background: `var(--color-${warn ? 'warn' : 'bad'}-soft)` }}
    >
      <span style={{ display: 'flex', color: `var(--color-${warn ? 'warn' : 'bad'})` }}>
        <Icon name={copy.icon as 'hourglass'} weight="fill" size="lg" />
      </span>
      <div className={styles.bannerBody}>
        <Text
          variant="bodyBold"
          as="div"
          style={{ color: `var(--color-${warn ? 'warn' : 'bad'})` }}
        >
          {copy.title}
        </Text>
        <Text variant="caption" as="div">
          {canManage ? copy.body : 'Ask a team admin to finish payout setup.'}
        </Text>
      </div>
      {canManage && copy.cta ? (
        <Button loading={busy} onClick={go}>
          {copy.cta}
        </Button>
      ) : null}
    </div>
  );
}

const STEPS = ['Confirm your team details', 'Add a bank account', 'Start collecting payments'];

/** Big tile for "Not set up": the only payout state that gets one. */
export function PayoutSetupTile({ payout }: { payout: Payout }) {
  const { canManage, busy, go } = payout;
  return (
    <div className={styles.setupTile} data-testid="connect-card">
      <div className={styles.setupCopy}>
        <Text variant="label" muted as="div">
          Payouts · Not set up
        </Text>
        <Text variant="title" as="h2">
          Set up payouts to start collecting
        </Text>
        <Text muted as="p">
          Money from payments goes to your bank account. Setup is a one-time step.
        </Text>
        <ol className={styles.stack} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((t, i) => (
            <li key={t} className={styles.row}>
              <span className={styles.stepNum}>{i + 1}</span>
              <Text variant="bodyBold">{t}</Text>
            </li>
          ))}
        </ol>
        {canManage ? (
          <Button size="lg" loading={busy} onClick={go}>
            Set up payouts
            <Icon name="arrow-right" size="sm" />
          </Button>
        ) : (
          <Text variant="caption" muted as="p">
            Ask a team admin to set up payouts. Coaches and managers can send requests once it’s
            ready.
          </Text>
        )}
      </div>
      <div className={styles.setupArt} aria-hidden>
        <span className={styles.success}>
          <Icon name="bank" weight="fill" size="xl" />
        </span>
      </div>
    </div>
  );
}

/** Payout settings: open Stripe and set who pays the card fee by default. */
export function PayoutSettings({
  owner,
  payout,
  open,
  onClose,
}: {
  owner: Owner;
  payout: Payout;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const { s, status, busy, go, canManage } = payout;
  return (
    <Sheet open={open} onClose={onClose} title="Payout settings">
      <div className={styles.stack}>
        <div className={styles.drawerHead}>
          <Text variant="heading" as="h2">
            Payout settings
          </Text>
        </div>
        <Text muted as="p">
          Payouts are on. Money from payments goes to your bank account.
        </Text>
        {canManage ? (
          <>
            <Button variant="secondary" loading={busy} onClick={go}>
              Open payout settings
            </Button>
            {s?.exists_account ? (
              <SegmentedControl
                label="Who pays the card fee by default"
                value={(s.default_fee_policy as 'absorb' | 'pass_on') ?? 'absorb'}
                options={[
                  { value: 'absorb', label: 'We pay the fee' },
                  { value: 'pass_on', label: 'Families pay a service fee' },
                ]}
                onChange={async (v) => {
                  const r = await setDefaultFeePolicy(getClient(), owner, v);
                  if (r.error) toast(friendlyError(r.error), 'danger');
                  else status.reload();
                }}
              />
            ) : null}
          </>
        ) : (
          <Text variant="caption" muted as="p">
            Ask a team admin to change payout settings.
          </Text>
        )}
      </div>
    </Sheet>
  );
}

'use client';

import { friendlyError } from '@athleit/core';
import {
  getConnectedAccountStatus,
  setDefaultFeePolicy,
  startConnectOnboarding,
  type Owner,
} from '@athleit/db/payments';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Badge, Button, Card, SegmentedControl, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './payments.module.css';

const COPY: Record<
  string,
  { tone: 'neutral' | 'warning' | 'success' | 'danger'; label: string; body: string; cta: string }
> = {
  not_started: {
    tone: 'neutral',
    label: 'Not started',
    body: 'Set up payouts to collect fees. It takes a few minutes with Stripe.',
    cta: 'Set up payouts',
  },
  in_review: {
    tone: 'warning',
    label: 'In review',
    body: 'Stripe is reviewing your details. You can send requests as soon as it’s ready.',
    cta: 'Check status',
  },
  needs_info: {
    tone: 'danger',
    label: 'Needs info',
    body: 'Stripe needs a little more information before you can collect payments.',
    cta: 'Finish setup',
  },
  ready: {
    tone: 'success',
    label: 'Ready',
    body: 'Payouts are on. Money from payments goes to your bank account.',
    cta: 'Open payout settings',
  },
  disconnected: {
    tone: 'danger',
    label: 'Disconnected',
    body: 'Your Stripe account was disconnected. Set up payouts again to collect fees.',
    cta: 'Set up payouts',
  },
};

/** Connect status and "Set up payouts". Admins can start/continue Stripe's hosted onboarding; coaches and managers only see status. */
export function ConnectCard({
  owner,
  onReadyChange,
}: {
  owner: Owner;
  onReadyChange?: (ready: boolean) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = useLoad(async () => {
    const r = await getConnectedAccountStatus(getClient(), owner);
    onReadyChange?.(!!r.data?.charges_enabled);
    return r;
  }, [owner.teamId, owner.clubId]);
  const s = status.data;
  const key = s?.exists_account ? s.onboarding_status : 'not_started';
  const copy = COPY[key] ?? COPY.not_started!;

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

  return (
    <Card>
      <LoadState loading={status.loading} error={status.error} onRetry={status.reload}>
        <div className={styles.stack} data-testid="connect-card">
          <div className={styles.between}>
            <Text variant="heading" as="h2">
              Payouts
            </Text>
            <Badge tone={copy.tone}>{copy.label}</Badge>
          </div>
          <Text muted as="p">
            {s?.can_manage || key === 'ready'
              ? copy.body
              : 'Ask a team admin to set up payouts. Coaches and managers can send requests once it’s ready.'}
          </Text>
          {s?.can_manage ? (
            <>
              <Button
                loading={busy}
                onClick={go}
                variant={key === 'ready' ? 'secondary' : 'primary'}
              >
                {copy.cta}
              </Button>
              {s.exists_account ? (
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
          ) : null}
        </div>
      </LoadState>
    </Card>
  );
}

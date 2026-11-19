'use client';

import type { PayRow } from '@athleit/core';
import { getHouseholdPayments, getHouseholdReceipts, getOpenPayments } from '@athleit/db/payments';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { SegmentedControl } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { CheckoutSheet } from './checkout';
import { DueView } from './due-view';
import { PlansPanel } from './plans-panel';
import styles from './parent-pay.module.css';
import { ReceiptsView } from './receipts-view';

type Tab = 'due' | 'receipts';

/**
 * Parent Pay: Due (grouped requests, payment summary) and Receipts (month-grouped, detail in a side sheet).
 * Checkout opens as a side sheet. Amounts are only displayed here; the checkout total always comes from the server.
 */
export function PayView() {
  const [tab, setTab] = useState<Tab>('due');
  const linked = useSearchParams().get('request');
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const [checkoutInstallments, setCheckoutInstallments] = useState<string[] | null>(null);
  const [plansKey, setPlansKey] = useState(0);
  const due = useLoad(() => getHouseholdPayments(getClient()), []);
  const receipts = useLoad(() => getHouseholdReceipts(getClient()), []);
  const open = useLoad(() => getOpenPayments(getClient()), []);

  return (
    <div className={styles.page}>
      <SegmentedControl
        label="Pay sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'due', label: 'Due' },
          { value: 'receipts', label: 'Receipts' },
        ]}
      />
      {tab === 'due' ? <PlansPanel onPay={setCheckoutInstallments} refreshKey={plansKey} /> : null}
      {tab === 'due' ? (
        <DueView
          rows={due.data}
          open={open.data ?? []}
          onChanged={() => {
            due.reload();
            open.reload();
          }}
          loading={due.loading}
          error={due.error}
          onRetry={due.reload}
          linked={linked}
          onPay={setCheckout}
          onReceipts={() => setTab('receipts')}
        />
      ) : (
        <ReceiptsView
          rows={receipts.data}
          loading={receipts.loading}
          error={receipts.error}
          onRetry={receipts.reload}
        />
      )}
      <CheckoutSheet
        requestIds={checkout}
        installmentIds={checkoutInstallments}
        rows={(due.data ?? []) as unknown as PayRow[]}
        onClose={() => {
          setCheckout(null);
          setCheckoutInstallments(null);
          setPlansKey((k) => k + 1);
          // Opening checkout reserves the requests, so refresh what is shown when it closes.
          due.reload();
          open.reload();
        }}
        onFinished={() => {
          setPlansKey((k) => k + 1);
          due.reload();
          receipts.reload();
          open.reload();
        }}
      />
    </div>
  );
}

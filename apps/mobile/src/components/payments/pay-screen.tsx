import type { PayRow } from '@athleit/core';
import { getHouseholdPayments, getHouseholdReceipts, getOpenPayments } from '@athleit/db/payments';
import { space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { H1 } from '@/components/app/kit';
import { SegmentedControl, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Checkout } from './checkout';
import { DueTab } from './due-tab';
import { ReceiptsTab } from './receipts-tab';

/**
 * Parent Pay: Due (grouped requests, pinned Pay bar) and Receipts (month-grouped). Amounts are displayed only; the
 * server quotes every total. `embedded` drops the page title (the staff "My payments" view renders this too).
 */
export function PayScreen({ embedded = false }: { embedded?: boolean }) {
  const { request } = useLocalSearchParams<{ request?: string }>();
  const [tab, setTab] = useState<'due' | 'receipts'>('due');
  const [checkout, setCheckout] = useState<string[] | null>(null);
  const due = useLoad(() => getHouseholdPayments(supabase), []);
  const receipts = useLoad(() => getHouseholdReceipts(supabase), []);
  const open = useLoad(() => getOpenPayments(supabase), []);
  return (
    <View style={{ gap: space[4] }}>
      {embedded ? null : (
        <View style={{ gap: space[1] }}>
          <H1>Pay</H1>
          <Text muted>Requests, payments and receipts</Text>
        </View>
      )}
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

'use client';

import { type Owner, getCollectionSummary, listPaymentEvents } from '@athleit/db/payments';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { LoadState } from '@/components/app/states';
import { Button, Icon, Sheet, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import {
  PayoutBadge,
  PayoutNotice,
  PayoutSetupTile,
  PayoutSettings,
  usePayout,
} from './connect-card';
import { NewRequestForm } from './new-request-form';
import styles from './payments.module.css';
import { RequestDetail } from './request-detail';
import { RequestList, StatTiles, type Summaries } from './request-list';

/** Staff Pay body (the /pay page owns the title and the My payments toggle): payout status, "New request", stat tiles, request list, detail. */
export function StaffPayments({
  owner,
  canSend,
  isAdmin,
}: {
  owner: Owner;
  canSend: boolean;
  isAdmin: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(useSearchParams().get('event'));
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const payout = usePayout(owner, setReady);
  const events = useLoad(
    () => listPaymentEvents(getClient(), owner),
    [owner.teamId, owner.clubId, refresh],
  );
  const list = (events.data ?? []).filter((e) => e.status !== 'draft');
  const ids = list.map((e) => e.id).join(',');
  const sums = useLoad(async () => {
    const out: Summaries = {};
    await Promise.all(
      list.map(async (e) => {
        out[e.id] = (await getCollectionSummary(getClient(), e.id)).data;
      }),
    );
    return { data: out, error: null };
  }, [ids, refresh]);
  const current = list.find((e) => e.id === selected) ?? null;

  const changed = () => setRefresh((n) => n + 1);
  const newRequest = canSend ? (
    <Button onClick={() => setDrawer(true)} disabled={!ready}>
      <Icon name="plus" size="sm" />
      New request
    </Button>
  ) : null;
  const notSetUp = payout.key === 'not_started' && !payout.status.loading;

  return (
    <div className={styles.page}>
      {current ? null : (
        <div className={styles.headerActions} style={{ justifyContent: 'flex-end' }}>
          {payout.key === 'ready' ? <PayoutBadge onOpen={() => setSettings(true)} /> : null}
          {newRequest}
        </div>
      )}
      {notSetUp ? <PayoutSetupTile payout={payout} /> : null}
      {!notSetUp && payout.key !== 'ready' && !payout.status.loading ? (
        <PayoutNotice payout={payout} />
      ) : null}
      {current ? (
        <RequestDetail
          event={current}
          isAdmin={isAdmin}
          canSend={canSend}
          onBack={() => setSelected(null)}
          onChanged={() => {
            events.reload();
            sums.reload();
          }}
        />
      ) : (
        <LoadState
          loading={events.loading && !events.data}
          error={events.error}
          onRetry={events.reload}
        >
          {list.length === 0 ? (
            <div className={styles.panel}>
              <div className={styles.centerTile} data-testid="collection">
                <span className={styles.success} aria-hidden>
                  <Icon name="receipt" size="lg" />
                </span>
                <Text variant="heading" as="h2">
                  No payment requests yet
                </Text>
                <Text muted as="p">
                  Create one to collect fees, dues or tournament costs from your roster.
                </Text>
                {newRequest}
              </div>
            </div>
          ) : (
            <>
              <StatTiles events={list} sums={sums.data ?? {}} />
              <RequestList events={list} sums={sums.data ?? {}} onOpen={setSelected} />
            </>
          )}
        </LoadState>
      )}

      <Sheet open={drawer} onClose={() => setDrawer(false)} title="New payment request">
        <NewRequestForm
          owner={owner}
          canSend={ready}
          defaultPolicy={(payout.s?.default_fee_policy as 'absorb' | 'pass_on') ?? 'absorb'}
          onSent={changed}
          onClose={() => setDrawer(false)}
        />
      </Sheet>
      <PayoutSettings
        owner={owner}
        payout={payout}
        open={settings}
        onClose={() => setSettings(false)}
      />
    </div>
  );
}

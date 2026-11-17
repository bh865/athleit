'use client';

import type { Owner } from '@athleit/db/payments';
import { useState } from 'react';

import { CollectionPanel } from './collection';
import { ConnectCard } from './connect-card';
import { NewRequestForm } from './new-request-form';
import styles from './payments.module.css';

/** Staff Payments: the "New payment request" card beside the collection card, payout status on top. */
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
  return (
    <div className={styles.layout}>
      <ConnectCard owner={owner} onReadyChange={setReady} />
      <div className={styles.grid}>
        {canSend ? (
          <NewRequestForm owner={owner} canSend={ready} onSent={() => setRefresh((n) => n + 1)} />
        ) : null}
        <CollectionPanel owner={owner} isAdmin={isAdmin} refreshKey={refresh} />
      </div>
    </div>
  );
}

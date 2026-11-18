'use client';

import { friendlyError, registrationPriceLabel } from '@athleit/core';
import {
  getRegistrationDetail,
  getRegistrationPaymentStatus,
  listMyRegistrations,
  withdrawRegistration,
} from '@athleit/db/registration';
import Link from 'next/link';
import { useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import { Button, Card, Heading, ListGroup, ListRow, Text } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';
import { RegistrationStatusBadge } from './status';
import { WaiverSigner, type WaiverToSign } from './waiver-signer';

const NEXT_STEP: Record<string, string> = {
  sign_waivers: 'Sign waivers',
  pay: 'Payment due',
  verify_email: 'Confirm your email',
};

export function MyRegistrations() {
  const client = getClient();
  const list = useLoad(() => listMyRegistrations(client), []);
  return (
    <div className={styles.stack}>
      <Heading as="h1" level="title">
        My registrations
      </Heading>
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        emptyText="You haven’t registered for anything yet. Open a registration link to get started."
        onRetry={list.reload}
      >
        <ListGroup>
          {(list.data ?? []).map((r) => (
            <li key={r.id}>
              <ListRow
                href={`/registrations/${r.id}`}
                title={`${r.player_first_name} · ${r.event_title}`}
                subtitle={`${registrationPriceLabel(r.price_cents)} · ${r.display_id}${NEXT_STEP[r.next_step] ? ` · ${NEXT_STEP[r.next_step]}` : ''}`}
                trailing={<RegistrationStatusBadge status={r.status} />}
              />
            </li>
          ))}
        </ListGroup>
      </LoadState>
    </div>
  );
}

export function RegistrationDetailView({ id }: { id: string }) {
  const client = getClient();
  const [tick, setTick] = useState(0);
  const detail = useLoad(() => getRegistrationDetail(client, id), [id, tick]);
  const payment = useLoad(() => getRegistrationPaymentStatus(client, id), [id, tick]);
  const waivers = useLoad(async () => {
    const d = await getRegistrationDetail(client, id);
    const ws = (d.data?.waivers ?? []) as {
      waiver_version_id: string;
      title: string;
      acceptance_id: string | null;
    }[];
    if (!ws.length) return { data: [] as WaiverToSign[], error: null };
    const { data, error } = await client
      .from('waiver_versions')
      .select('id, title, body')
      .in(
        'id',
        ws.map((w) => w.waiver_version_id),
      );
    if (error) return { data: null, error: { message: error.message } };
    return {
      data: (data ?? []).map((v) => ({
        versionId: v.id,
        title: v.title,
        body: v.body,
        signed: Boolean(ws.find((w) => w.waiver_version_id === v.id)?.acceptance_id),
      })) as WaiverToSign[],
      error: null,
    };
  }, [id, tick]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const r = detail.data?.registration;
  const ev = detail.data?.event;
  const pay = payment.data;

  async function withdraw() {
    setError(null);
    const res = await withdrawRegistration(client, id);
    if (res.error) setError(friendlyError(res.error));
    setConfirm(false);
    setTick((n) => n + 1);
  }
  const active = r && !['withdrawn', 'declined'].includes(r.status);

  return (
    <div className={styles.stack}>
      <Link href="/registrations">← My registrations</Link>
      <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload}>
        {r && ev ? (
          <>
            <div className={`${styles.row} ${styles.between}`}>
              <Heading as="h1" level="title">
                {ev.title}
              </Heading>
              <RegistrationStatusBadge status={r.status} />
            </div>
            <Text variant="mono">{r.display_id}</Text>
            <Card>
              <dl className={styles.factGrid}>
                <div className={styles.fact}>
                  <dt>Child</dt>
                  <dd>
                    {r.player_first_name} {r.player_last_name}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt>Submitted</dt>
                  <dd>
                    {new Date(r.submitted_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </dd>
                </div>
                {r.waitlist_position ? (
                  <div className={styles.fact}>
                    <dt>Waitlist position</dt>
                    <dd>{r.waitlist_position}</dd>
                  </div>
                ) : null}
                <div className={styles.fact}>
                  <dt>Price</dt>
                  <dd>{registrationPriceLabel(ev.price_cents)}</dd>
                </div>
              </dl>
              {r.decision_note ? (
                <Text as="p" muted>
                  Message from the organizer: {r.decision_note}
                </Text>
              ) : null}
              {r.status === 'accepted' && ev.confirmation_message ? (
                <Text as="p">{ev.confirmation_message}</Text>
              ) : null}
            </Card>
            {pay &&
            pay.request_status !== 'paid' &&
            pay.request_status !== 'cancelled' &&
            active ? (
              <Card>
                <div className={styles.row}>
                  <Text className={styles.grow}>
                    Payment due: {registrationPriceLabel(pay.amount_cents)}
                  </Text>
                  <Link href="/pay">
                    <Button>Pay now</Button>
                  </Link>
                </div>
              </Card>
            ) : pay?.request_status === 'paid' ? (
              <Text muted>Paid. A receipt is on your Pay page.</Text>
            ) : null}
            {waivers.data && waivers.data.length > 0 && (
              <Card>
                <div className={styles.stack}>
                  <Heading as="h2">Waivers</Heading>
                  {waivers.data.every((w) => w.signed) ? (
                    <Text muted>All waivers are signed.</Text>
                  ) : (
                    <WaiverSigner
                      waivers={waivers.data}
                      registrationId={id}
                      onChanged={() => setTick((n) => n + 1)}
                    />
                  )}
                </div>
              </Card>
            )}
            {error ? <FormMessage error={error} /> : null}
            {active ? (
              confirm ? (
                <div className={styles.row}>
                  <Text>Withdraw this registration? Your spot will be released.</Text>
                  <Button variant="secondary" onClick={() => setConfirm(false)}>
                    Keep it
                  </Button>
                  <Button onClick={() => void withdraw()}>Withdraw</Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setConfirm(true)}>
                  Withdraw registration
                </Button>
              )
            ) : null}
          </>
        ) : null}
      </LoadState>
    </div>
  );
}

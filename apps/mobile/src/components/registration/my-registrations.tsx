import {
  friendlyError,
  REGISTRATION_STATUS_LABELS,
  registrationPriceLabel,
  registrationStatusTone,
} from '@athleit/core';
import {
  getRegistrationDetail,
  getRegistrationPaymentStatus,
  listMyRegistrations,
  listOpenRegistrationEvents,
  withdrawRegistration,
} from '@athleit/db/registration';
import { ListGroup } from '@/components/ui';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, FormMessage, H1, H2, ListItem, LoadState } from '@/components/app/kit';
import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { WaiverSigner, type WaiverToSign } from './waiver-signer';

const NEXT_STEP: Record<string, string> = {
  sign_waivers: 'Sign waivers',
  pay: 'Payment due',
  verify_email: 'Confirm your email',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={registrationStatusTone(status)}>
      {REGISTRATION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function MyRegistrations() {
  const router = useRouter();
  const mine = useLoad(() => listMyRegistrations(supabase), []);
  const open = useLoad(() => listOpenRegistrationEvents(supabase), []);
  return (
    <View style={{ gap: space[6] }}>
      <H1>Registrations</H1>
      <View style={{ gap: space[3] }}>
        <H2>My registrations</H2>
        <LoadState
          loading={mine.loading}
          error={mine.error}
          empty={mine.data?.length === 0}
          emptyText="You haven’t registered for anything yet."
          onRetry={mine.reload}
        >
          <ListGroup>
            {(mine.data ?? []).map((r) => (
              <ListItem
                key={r.id}
                title={`${r.player_first_name} · ${r.event_title}`}
                subtitle={`${registrationPriceLabel(r.price_cents)} · ${r.display_id}${NEXT_STEP[r.next_step] ? ` · ${NEXT_STEP[r.next_step]}` : ''}`}
                right={<StatusBadge status={r.status} />}
                onPress={() => router.push(`/registrations/${r.id}` as never)}
              />
            ))}
          </ListGroup>
        </LoadState>
      </View>
      <View style={{ gap: space[3] }}>
        <H2>Open for registration</H2>
        <LoadState
          loading={open.loading}
          error={open.error}
          empty={open.data?.length === 0}
          emptyText="Nothing is open right now. Open a registration link to sign up."
          onRetry={open.reload}
        >
          <ListGroup>
            {(open.data ?? []).map((e) => (
              <ListItem
                key={e.slug}
                title={e.title}
                subtitle={`${e.issuer_name} · ${registrationPriceLabel(e.price_cents)}`}
                onPress={() => router.push(`/r/${e.slug}` as never)}
              />
            ))}
          </ListGroup>
        </LoadState>
      </View>
    </View>
  );
}

export function RegistrationDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const detail = useLoad(() => getRegistrationDetail(supabase, id), [id, tick]);
  const payment = useLoad(() => getRegistrationPaymentStatus(supabase, id), [id, tick]);
  const waivers = useLoad(async () => {
    const d = await getRegistrationDetail(supabase, id);
    const ws = d.data?.waivers ?? [];
    if (!ws.length) return { data: [] as WaiverToSign[], error: null };
    const { data, error } = await supabase
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
  const active = r && !['withdrawn', 'declined'].includes(r.status);

  async function withdraw() {
    setError(null);
    const res = await withdrawRegistration(supabase, id);
    if (res.error) setError(friendlyError(res.error));
    setConfirm(false);
    setTick((n) => n + 1);
  }
  return (
    <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload}>
      {r && ev ? (
        <View style={{ gap: space[4] }}>
          <H1>{ev.title}</H1>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <StatusBadge status={r.status} />
            <Text variant="mono">{r.display_id}</Text>
          </View>
          <Card style={{ gap: space[2] }}>
            <Text variant="bodyBold">
              {r.player_first_name} {r.player_last_name}
            </Text>
            <Text muted>Submitted {new Date(r.submitted_at).toLocaleDateString()}</Text>
            {r.waitlist_position ? (
              <Text muted>Waitlist position {r.waitlist_position}</Text>
            ) : null}
            <Text>{registrationPriceLabel(ev.price_cents)}</Text>
            {r.decision_note ? (
              <Text muted>Message from the organizer: {r.decision_note}</Text>
            ) : null}
            {r.status === 'accepted' && ev.confirmation_message ? (
              <Text>{ev.confirmation_message}</Text>
            ) : null}
          </Card>
          {pay && active && pay.request_status !== 'paid' && pay.request_status !== 'cancelled' ? (
            <Card style={{ gap: space[3] }}>
              <Text>Payment due: {registrationPriceLabel(pay.amount_cents)}</Text>
              <Button title="Pay now" onPress={() => router.push('/pay' as never)} />
            </Card>
          ) : pay?.request_status === 'paid' ? (
            <Text muted>Paid. A receipt is on your Pay tab.</Text>
          ) : null}
          {waivers.data && waivers.data.length > 0 ? (
            <Card style={{ gap: space[3] }}>
              <H2>Waivers</H2>
              {waivers.data.every((w) => w.signed) ? (
                <Text muted>All waivers are signed.</Text>
              ) : (
                <WaiverSigner
                  waivers={waivers.data}
                  registrationId={id}
                  onChanged={() => setTick((n) => n + 1)}
                />
              )}
            </Card>
          ) : null}
          <FormMessage error={error} />
          {active ? (
            confirm ? (
              <View style={{ gap: space[3] }}>
                <Text>Withdraw this registration? Your spot will be released.</Text>
                <Button title="Withdraw" onPress={() => void withdraw()} />
                <Button title="Keep it" variant="secondary" onPress={() => setConfirm(false)} />
              </View>
            ) : (
              <Button
                title="Withdraw registration"
                variant="secondary"
                onPress={() => setConfirm(true)}
              />
            )
          ) : null}
        </View>
      ) : null}
    </LoadState>
  );
}

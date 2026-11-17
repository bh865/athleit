import {
  computeFees,
  createPaymentEventSchema,
  formatCents,
  friendlyError,
  MIN_CHARGE_CENTS,
  paymentRequestStatusLabel,
  parseDollarsToCents,
  ATHLEIT_CHARGE_LABEL,
  SERVICE_FEE_LABEL,
  type FeePolicy,
  type PaymentRequestStatus,
} from '@athleit/core';
import {
  createPaymentEvent,
  getActiveFeeConfig,
  getCollectionDetail,
  getCollectionSummary,
  getConnectedAccountStatus,
  listPaymentEvents,
  publishPaymentEvent,
  recordOfflinePayment,
  sendPaymentReminders,
  startConnectOnboarding,
  waiveRequest,
  type Owner,
} from '@athleit/db/payments';
import { radius, space } from '@athleit/tokens';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { FormMessage, H1, H2, LoadState } from '@/components/app/kit';
import {
  Badge,
  Button,
  Card,
  SegmentedControl,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';

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
    body: 'Stripe is reviewing your details.',
    cta: 'Check status',
  },
  needs_info: {
    tone: 'danger',
    label: 'Needs info',
    body: 'Stripe needs a little more information.',
    cta: 'Finish setup',
  },
  ready: { tone: 'success', label: 'Ready', body: 'Payouts are on.', cta: 'Open payout settings' },
  disconnected: {
    tone: 'danger',
    label: 'Disconnected',
    body: 'Your Stripe account was disconnected.',
    cta: 'Set up payouts',
  },
};

function Connect({ owner, onReady }: { owner: Owner; onReady: (r: boolean) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const st = useLoad(async () => {
    const r = await getConnectedAccountStatus(supabase, owner);
    onReady(!!r.data?.charges_enabled);
    return r;
  }, [owner.teamId, owner.clubId]);
  const s = st.data;
  const key = s?.exists_account ? s.onboarding_status : 'not_started';
  const c = COPY[key] ?? COPY.not_started!;
  const go = async () => {
    setBusy(true);
    const r = await startConnectOnboarding(
      supabase,
      owner,
      'mobile',
      key === 'in_review' ? 'sync' : 'link',
    );
    setBusy(false);
    if (r.error) return toast(friendlyError(r.error), 'danger');
    if (r.data.url) await WebBrowser.openBrowserAsync(r.data.url);
    st.reload();
  };
  return (
    <Card>
      <LoadState loading={st.loading} error={st.error} onRetry={st.reload}>
        <View style={{ gap: space[3] }} testID="connect-card">
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <H2>Payouts</H2>
            <Badge tone={c.tone}>{c.label}</Badge>
          </View>
          <Text muted>
            {s?.can_manage || key === 'ready' ? c.body : 'Ask a team admin to set up payouts.'}
          </Text>
          {s?.can_manage ? (
            <Button
              title={c.cta}
              loading={busy}
              variant={key === 'ready' ? 'secondary' : 'primary'}
              onPress={go}
            />
          ) : null}
        </View>
      </LoadState>
    </Card>
  );
}

function NewRequest({
  owner,
  canSend,
  onSent,
}: {
  owner: Owner;
  canSend: boolean;
  onSent: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [policy, setPolicy] = useState<FeePolicy>('absorb');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cfg = useLoad(() => getActiveFeeConfig(supabase), []);
  const cents = parseDollarsToCents(amount);
  const preview = useMemo(
    () =>
      cents !== null && cents >= MIN_CHARGE_CENTS && cfg.data
        ? computeFees(cents, policy, cfg.data)
        : null,
    [cents, policy, cfg.data],
  );

  const submit = async () => {
    setError(null);
    const parsed = createPaymentEventSchema.safeParse({
      ...owner,
      title,
      amountCents: cents ?? 0,
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:00`).toISOString() : '',
      audience: 'all_active_roster',
      feePolicy: policy,
    });
    if (!parsed.success)
      return setError(
        cents === null || cents < MIN_CHARGE_CENTS
          ? `Enter an amount of at least ${formatCents(MIN_CHARGE_CENTS)}.`
          : 'Add a title and a due date (YYYY-MM-DD).',
      );
    setBusy(true);
    const made = await createPaymentEvent(supabase, {
      ...owner,
      title: parsed.data.title,
      amountCents: parsed.data.amountCents,
      dueAt: parsed.data.dueAt,
      audience: 'all_active_roster',
      feePolicy: policy,
    });
    if (made.error) {
      setBusy(false);
      return setError(friendlyError(made.error));
    }
    const sent = await publishPaymentEvent(supabase, made.data);
    setBusy(false);
    if (sent.error)
      return setError(`${friendlyError(sent.error)} Your request was saved as a draft.`);
    toast(`Sent to ${sent.data} ${sent.data === 1 ? 'player' : 'players'}`);
    setTitle('');
    setAmount('');
    setDue('');
    onSent();
  };
  return (
    <Card>
      <View style={{ gap: space[3] }}>
        <H2>New payment request</H2>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Jersey fee"
          maxLength={100}
        />
        <TextField
          label="Amount"
          mono
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="45.00"
        />
        <TextField
          label="Due date"
          mono
          value={due}
          onChangeText={setDue}
          placeholder="2026-11-30"
          autoCapitalize="none"
        />
        <SegmentedControl
          label="Who pays the card fee"
          value={policy}
          onChange={setPolicy}
          options={[
            { value: 'absorb', label: 'We pay the fee' },
            { value: 'pass_on', label: 'Families pay a service fee' },
          ]}
        />
        {preview ? (
          <View testID="fee-preview" accessibilityLiveRegion="polite">
            <Line k="Request" cents={preview.baseCents} />
            {preview.platformFeeCents > 0 ? (
              <Line k={ATHLEIT_CHARGE_LABEL} cents={preview.platformFeeCents} />
            ) : null}
            {preview.processingFeeCents > 0 ? (
              <Line k={SERVICE_FEE_LABEL} cents={preview.processingFeeCents} />
            ) : null}
            <Line k="Each family pays" cents={preview.totalCents} big />
          </View>
        ) : null}
        <FormMessage error={error} />
        <Button
          title="Send request"
          size="lg"
          loading={busy}
          disabled={!canSend}
          onPress={submit}
          testID="send-request"
        />
        {!canSend ? (
          <Text variant="caption" muted>
            Set up payouts first, then you can send requests.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function Line({ k, cents, big }: { k: string; cents: number; big?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 44,
      }}
    >
      <Text muted={!big} variant={big ? 'bodyBold' : 'body'}>
        {k}
      </Text>
      <Amount cents={cents} variant={big ? 'monoLg' : 'mono'} />
    </View>
  );
}

function Collection({ owner, refreshKey }: { owner: Owner; refreshKey: number }) {
  const toast = useToast();
  const { theme } = useTheme();
  const events = useLoad(
    () => listPaymentEvents(supabase, owner),
    [owner.teamId, owner.clubId, refreshKey],
  );
  const list = (events.data ?? []).filter((e) => e.status !== 'draft');
  const current = list[0] ?? null;
  const [tick, setTick] = useState(0);
  const summary = useLoad(
    () =>
      current
        ? getCollectionSummary(supabase, current.id)
        : Promise.resolve({ data: null, error: null }),
    [current?.id, tick, refreshKey],
  );
  const detail = useLoad(
    () =>
      current
        ? getCollectionDetail(supabase, current.id)
        : Promise.resolve({ data: [], error: null }),
    [current?.id, tick, refreshKey],
  );
  const s = summary.data;
  const reload = () => setTick((t) => t + 1);
  const remind = async () => {
    if (!current) return;
    const r = await sendPaymentReminders(supabase, current.id);
    toast(
      r.error
        ? friendlyError(r.error)
        : r.data === 0
          ? 'Everyone was reminded in the last 24 hours'
          : `Reminder sent for ${r.data} requests`,
      r.error ? 'danger' : 'success',
    );
    reload();
  };
  return (
    <Card>
      <LoadState
        loading={events.loading}
        error={events.error}
        empty={list.length === 0}
        emptyText="No payment requests yet"
        onRetry={events.reload}
      >
        {current && s ? (
          <View style={{ gap: space[3] }} testID="collection">
            <H2>{current.title}</H2>
            <Text muted>
              {formatCents(Number(s.collected_cents))} of {formatCents(Number(s.expected_cents))} ·
              due {dueText(current.due_at)}
            </Text>
            <View
              style={{
                height: space[2],
                borderRadius: radius.pill,
                backgroundColor: theme.color.surfaceAlt,
                overflow: 'hidden',
              }}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: s.progress_percent }}
            >
              <View
                style={{
                  width: `${s.progress_percent}%`,
                  height: '100%',
                  backgroundColor: theme.color.accent,
                }}
              />
            </View>
            <Button
              title="Send reminder"
              variant="secondary"
              onPress={remind}
              disabled={current.status !== 'published'}
            />
            <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload}>
              {(detail.data ?? []).map((r) => (
                <View key={r.request_id} style={{ gap: space[2], paddingVertical: space[2] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space[3],
                      minHeight: 44,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyBold">{r.player_name}</Text>
                      <Text variant="monoSm" muted>
                        {r.display_id}
                      </Text>
                    </View>
                    <Badge
                      tone={
                        r.status === 'unpaid' || r.status === 'processing'
                          ? 'warning'
                          : r.status === 'waived' || r.status === 'cancelled'
                            ? 'neutral'
                            : 'success'
                      }
                    >
                      {paymentRequestStatusLabel(r.status as PaymentRequestStatus)}
                    </Badge>
                    <Amount cents={r.amount_cents} />
                  </View>
                  {r.status === 'unpaid' ? (
                    <View style={{ flexDirection: 'row', gap: space[2] }}>
                      <Button
                        title="Paid cash"
                        variant="ghost"
                        onPress={async () => {
                          const x = await recordOfflinePayment(supabase, r.request_id, 'cash');
                          toast(
                            x.error ? friendlyError(x.error) : 'Marked paid',
                            x.error ? 'danger' : 'success',
                          );
                          reload();
                        }}
                      />
                      <Button
                        title="Waive"
                        variant="ghost"
                        onPress={async () => {
                          const x = await waiveRequest(supabase, r.request_id);
                          toast(
                            x.error ? friendlyError(x.error) : 'Request waived',
                            x.error ? 'danger' : 'success',
                          );
                          reload();
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </LoadState>
          </View>
        ) : null}
      </LoadState>
    </Card>
  );
}

/** Mobile staff Payments: payout status, create + send a request, collection status, remind, waive, offline. Refunds and CSV export live on the web. */
export function StaffScreen({ owner, canSend }: { owner: Owner; canSend: boolean }) {
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  return (
    <View style={{ gap: space[4] }}>
      <H1>Payments</H1>
      <Connect owner={owner} onReady={setReady} />
      {canSend ? (
        <NewRequest owner={owner} canSend={ready} onSent={() => setRefresh((n) => n + 1)} />
      ) : null}
      <Collection owner={owner} refreshKey={refresh} />
    </View>
  );
}

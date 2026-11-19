import { PlanSheet } from './plan-sheet';
import {
  audienceLabel,
  collectionState,
  collectionStateLabel,
  computeFees,
  createPaymentEventSchema,
  formatCents,
  friendlyError,
  MIN_CHARGE_CENTS,
  parseDollarsToCents,
  ATHLEIT_CHARGE_LABEL,
  SERVICE_FEE_LABEL,
  type CollectionState,
  type FeePolicy,
} from '@athleit/core';
import {
  createPaymentEvent,
  getActiveFeeConfig,
  getCollectionDetail,
  getCollectionSummary,
  listPaymentEvents,
  publishPaymentEvent,
  recordOfflinePayment,
  sendPaymentReminders,
  setDefaultFeePolicy,
  waiveRequest,
  type CollectionRow,
  type CollectionSummary,
  type Owner,
  type PaymentEventRow,
} from '@athleit/db/payments';
import { radius, space } from '@athleit/tokens';
import { todayIso, type IconName } from '@athleit/ui-core';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { FormMessage, H1, H2, LoadState } from '@/components/app/kit';
import {
  Avatar,
  Button,
  Card,
  DatePicker,
  Icon,
  IconButton,
  SegmentedControl,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Amount, dueText } from './money';
import { PayScreen } from './pay-screen';
import {
  CountTabs,
  PayoutBadge,
  PayoutNotice,
  PayoutSetupTile,
  ProgressBar,
  StatTile,
  StatusPill,
  usePayout,
  type PillTone,
} from './staff-parts';

type Summaries = Record<string, CollectionSummary | null>;
const SHOW = 4;

const stateView: Record<CollectionState, { tone: PillTone; icon: IconName }> = {
  open: { tone: 'neutral', icon: 'circle-dashed' },
  due_soon: { tone: 'warn', icon: 'clock' },
  overdue: { tone: 'bad', icon: 'warning' },
  closed: { tone: 'ok', icon: 'check-circle' },
};
const eventState = (e: PaymentEventRow, s: CollectionSummary | null | undefined) =>
  collectionState({
    status: e.status,
    dueAt: e.due_at,
    outstandingCents: Number(s?.outstanding_cents ?? 0),
    totalRequests: s?.total_requests ?? 0,
  });

function NewRequest({
  owner,
  canSend,
  defaultPolicy,
  onSent,
  onClose,
}: {
  owner: Owner;
  canSend: boolean;
  defaultPolicy: FeePolicy;
  onSent: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [policy, setPolicy] = useState<FeePolicy>(defaultPolicy);
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
          : 'Add a title and a due date.',
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
    onClose();
  };
  return (
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
        label="Amount per player"
        mono
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        placeholder="45.00"
      />
      <DatePicker
        label="Due date"
        value={due}
        onChange={setDue}
        min={todayIso()}
        yearSpan={{ before: 0, after: 3 }}
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

type Group = 'all' | 'unpaid' | 'paid' | 'waived';
const PAID = ['paid', 'paid_offline', 'partially_refunded', 'refunded'];
const groupOf = (s: string): Group =>
  PAID.includes(s)
    ? 'paid'
    : s === 'waived'
      ? 'waived'
      : s === 'unpaid' || s === 'processing' || s === 'partially_paid'
        ? 'unpaid'
        : 'all';
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

function Detail({
  event,
  canSend,
  onBack,
  showBack = true,
  onChanged,
}: {
  event: PaymentEventRow;
  canSend: boolean;
  onBack: () => void;
  /** Inside Team details the screen already has a back button, so the in-page one is left out. */
  showBack?: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { theme } = useTheme();
  const c = theme.color;
  const [tick, setTick] = useState(0);
  const summary = useLoad(() => getCollectionSummary(supabase, event.id), [event.id, tick]);
  const detail = useLoad(() => getCollectionDetail(supabase, event.id), [event.id, tick]);
  const [group, setGroup] = useState<Group>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(8);
  const [acting, setActing] = useState<CollectionRow | null>(null);
  const [planRow, setPlanRow] = useState<CollectionRow | null>(null);
  const reload = () => {
    setTick((t) => t + 1);
    onChanged();
  };
  const s = summary.data;
  const all = detail.data ?? [];
  const counts = { all: all.length, unpaid: 0, paid: 0, waived: 0 };
  for (const r of all) {
    const g = groupOf(r.status);
    if (g !== 'all') counts[g] += 1;
  }
  const shown = all
    .filter((r) => (group === 'all' ? true : groupOf(r.status) === group))
    .filter((r) => r.player_name.toLowerCase().includes(q.trim().toLowerCase()));
  const st = collectionState({
    status: event.status,
    dueAt: event.due_at,
    outstandingCents: Number(s?.outstanding_cents ?? 0),
    totalRequests: s?.total_requests ?? 0,
  });
  const sv = stateView[st.state];

  const remind = async () => {
    const r = await sendPaymentReminders(supabase, event.id);
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
  const act = async (kind: 'offline' | 'waive') => {
    if (!acting) return;
    const x =
      kind === 'offline'
        ? await recordOfflinePayment(supabase, acting.request_id, 'cash')
        : await waiveRequest(supabase, acting.request_id);
    setActing(null);
    toast(
      x.error ? friendlyError(x.error) : kind === 'offline' ? 'Marked paid' : 'Request waived',
      x.error ? 'danger' : 'success',
    );
    reload();
  };

  return (
    <View style={{ gap: space[4] }} testID="collection">
      {showBack ? <IconButton icon="caret-left" label="Back to Pay" onPress={onBack} /> : null}
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <H2>{event.title}</H2>
            <Text variant="caption" muted>
              {formatCents(event.amount_cents)} each · Due {dueText(event.due_at)}
            </Text>
          </View>
          <StatusPill tone={sv.tone} icon={sv.icon}>
            {collectionStateLabel(st.state, st.daysLeft)}
          </StatusPill>
        </View>
        {s ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
              <Amount cents={Number(s.collected_cents)} variant="monoLg" label="Collected" />
              <Text variant="caption" muted>
                of {formatCents(Number(s.expected_cents))}
              </Text>
            </View>
            <ProgressBar percent={s.progress_percent} label={`${s.progress_percent}% collected`} />
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {[
                ['Unpaid', String(s.unpaid_count), formatCents(Number(s.outstanding_cents))],
                ['Paid', String(counts.paid), ''],
                ['Waived', String(s.waived_count), ''],
              ].map(([k, v, sub]) => (
                <View
                  key={k}
                  style={{
                    flex: 1,
                    padding: space[3],
                    borderRadius: radius.sm,
                    backgroundColor: c.surfaceAlt,
                  }}
                >
                  <Text variant="label" muted>
                    {k}
                  </Text>
                  <Text variant="monoLg">{v}</Text>
                  {sub ? (
                    <Text variant="caption" muted>
                      {sub}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
        <Button
          title="Send reminder"
          icon="bell-ringing"
          onPress={remind}
          disabled={event.status !== 'published'}
        />
      </Card>

      <CountTabs
        label="Players"
        value={group}
        onChange={(g) => {
          setGroup(g);
          setLimit(8);
        }}
        tabs={[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'unpaid', label: 'Unpaid', count: counts.unpaid },
          { key: 'paid', label: 'Paid', count: counts.paid },
          { key: 'waived', label: 'Waived', count: counts.waived },
        ]}
      />
      <Card style={{ padding: space[4], gap: space[2] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            minHeight: 44,
            paddingHorizontal: space[4],
            borderRadius: radius.pill,
            backgroundColor: c.surfaceAlt,
          }}
        >
          <Icon name="magnifying-glass" size="sm" color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search players"
            placeholderTextColor={c.muted}
            accessibilityLabel="Search players"
            style={{ flex: 1, color: c.ink, minHeight: 44 }}
          />
        </View>
        <LoadState
          loading={detail.loading && !detail.data}
          error={detail.error}
          empty={all.length === 0}
          emptyText="No players on this request"
          onRetry={detail.reload}
        >
          {shown.slice(0, limit).map((r) => {
            const g = groupOf(r.status);
            const tone: PillTone = g === 'paid' ? 'ok' : r.status === 'waived' ? 'neutral' : 'warn';
            const icon: IconName =
              g === 'paid'
                ? 'check-circle'
                : r.status === 'waived'
                  ? 'minus-circle'
                  : 'circle-dashed';
            const plan = r.plan_count !== null;
            const unpaid = r.status === 'unpaid' && !plan;
            return (
              <Pressable
                key={r.request_id}
                accessibilityRole="button"
                accessibilityLabel={`${r.player_name}, ${r.status}${(unpaid || plan) && canSend ? ', actions' : ''}${plan ? `, ${r.installments_paid} of ${r.plan_count} paid` : ''}`}
                disabled={!(unpaid || plan) || !canSend}
                onPress={() => (plan ? setPlanRow(r) : setActing(r))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  minHeight: 56,
                  borderBottomWidth: 1,
                  borderBottomColor: c.line,
                }}
              >
                <Avatar name={r.player_name} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{r.player_name}</Text>
                  <Text variant="monoSm" muted>
                    {r.display_id}
                    {r.paid_at ? ` · ${shortDate(r.paid_at)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                  <StatusPill tone={tone} icon={icon}>
                    {plan
                      ? `${r.installments_paid} of ${r.plan_count} paid${r.overdue ? ' · overdue' : ''}`
                      : r.status === 'unpaid'
                        ? 'Unpaid'
                        : r.status === 'waived'
                          ? 'Waived'
                          : g === 'paid'
                            ? 'Paid'
                            : r.status}
                  </StatusPill>
                  <Amount cents={r.amount_cents} variant="monoSm" />
                </View>
              </Pressable>
            );
          })}
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {shown.length === 0
              ? '0 players'
              : `1–${Math.min(limit, shown.length)} of ${shown.length}`}
          </Text>
          {limit < shown.length ? (
            <Button title="Show more" variant="ghost" onPress={() => setLimit((n) => n + 8)} />
          ) : null}
        </LoadState>
      </Card>

      {planRow ? (
        <PlanSheet
          key={planRow.request_id}
          row={planRow}
          canManage={canSend}
          onClose={() => setPlanRow(null)}
          onChanged={reload}
        />
      ) : null}
      <Sheet open={!!acting} onClose={() => setActing(null)} title="Player actions">
        {acting ? (
          <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Avatar name={acting.player_name} size="sm" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{acting.player_name}</Text>
                <Text variant="monoSm" muted>
                  {acting.display_id} · {formatCents(acting.amount_cents)}
                </Text>
              </View>
              <StatusPill tone="warn" icon="circle-dashed">
                Unpaid
              </StatusPill>
            </View>
            {(
              [
                ['hand-coins', 'Mark paid offline', 'Cash, check or other', 'offline'],
                ['minus-circle', 'Waive', 'Removes the amount due', 'waive'],
              ] as const
            ).map(([icon, title, sub, kind]) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                onPress={() => act(kind)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.pill,
                    backgroundColor: c.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={icon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{title}</Text>
                  <Text variant="caption" muted>
                    {sub}
                  </Text>
                </View>
                <Icon name="caret-right" size="sm" color={c.muted} />
              </Pressable>
            ))}
            <Button title="Cancel" variant="ghost" onPress={() => setActing(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function List({
  events,
  sums,
  onOpen,
}: {
  events: PaymentEventRow[];
  sums: Summaries;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.color;
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState(false);
  const [limit, setLimit] = useState(SHOW);
  const withState = useMemo(
    () => events.map((e) => ({ e, st: eventState(e, sums[e.id]) })),
    [events, sums],
  );
  const open = withState.filter((x) => x.st.state !== 'closed');
  const sum = (k: 'outstanding_cents' | 'collected_cents') =>
    open.reduce((n, x) => n + Number(sums[x.e.id]?.[k] ?? 0), 0);
  const overdue = open.filter((x) => x.st.state === 'overdue');
  const soon = open.filter((x) => x.st.state === 'due_soon').length;
  const shown = withState
    .filter((x) =>
      tab === 'all' ? true : tab === 'open' ? x.st.state !== 'closed' : x.st.state === 'closed',
    )
    .filter((x) => x.e.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => new Date(a.e.due_at).getTime() - new Date(b.e.due_at).getTime());
  const first = overdue[0];
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }} testID="stats">
        <StatTile
          label="Outstanding"
          value={<Amount cents={sum('outstanding_cents')} variant="monoLg" label="Outstanding" />}
          sub={`${open.length} open ${open.length === 1 ? 'request' : 'requests'}`}
        />
        <StatTile
          label="Collected"
          value={<Amount cents={sum('collected_cents')} variant="monoLg" label="Collected" />}
          sub="open requests"
        />
        <StatTile
          label="Open"
          value={<Text variant="monoLg">{String(open.length)}</Text>}
          sub={`${soon} due this week`}
        />
        <StatTile
          label="Overdue"
          icon="warning"
          tone={overdue.length ? 'bad' : undefined}
          value={
            <Text variant="monoLg" style={overdue.length ? { color: c.bad } : undefined}>
              {String(overdue.length)}
            </Text>
          }
          sub={
            first
              ? formatCents(Number(sums[first.e.id]?.outstanding_cents ?? 0))
              : 'Nothing overdue'
          }
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CountTabs
          label="Requests"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setLimit(SHOW);
          }}
          tabs={[
            { key: 'open', label: 'Open', count: open.length },
            { key: 'closed', label: 'Closed', count: withState.length - open.length },
            { key: 'all', label: 'All', count: withState.length },
          ]}
        />
        <IconButton
          icon="magnifying-glass"
          label="Search requests"
          onPress={() => setSearch((v) => !v)}
        />
      </View>
      {search ? (
        <TextField
          label="Search requests"
          value={q}
          onChangeText={setQ}
          placeholder="Request name"
        />
      ) : null}
      <View testID="collection" style={{ gap: space[3] }}>
        {shown.slice(0, limit).map(({ e, st }) => {
          const s = sums[e.id];
          const v = stateView[st.state];
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${e.title}, ${collectionStateLabel(st.state, st.daysLeft)}`}
              onPress={() => onOpen(e.id)}
            >
              <Card style={{ gap: space[2], padding: space[4] }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold">{e.title}</Text>
                    <Text variant="caption" muted>
                      Due {dueText(e.due_at)} · {audienceLabel(e.audience)}
                    </Text>
                  </View>
                  <StatusPill tone={v.tone} icon={v.icon}>
                    {collectionStateLabel(st.state, st.daysLeft)}
                  </StatusPill>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
                  <Amount
                    cents={Number(s?.collected_cents ?? 0)}
                    variant="monoLg"
                    label="Collected"
                  />
                  <Text variant="caption" muted>
                    collected
                  </Text>
                </View>
                <ProgressBar
                  percent={s?.progress_percent ?? 0}
                  label={`${s?.progress_percent ?? 0}% collected`}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" muted>
                    {s ? `${s.paid_count} of ${s.total_requests} paid` : ''}
                  </Text>
                  <Text variant="caption" muted>
                    Outstanding {formatCents(Number(s?.outstanding_cents ?? 0))}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
        {shown.length === 0 ? (
          <Text muted style={{ textAlign: 'center' }}>
            No requests here
          </Text>
        ) : (
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            Showing {Math.min(limit, shown.length)} of {shown.length}
          </Text>
        )}
        {limit < shown.length ? (
          <Button title="Show more" variant="ghost" onPress={() => setLimit((n) => n + SHOW)} />
        ) : null}
      </View>
    </View>
  );
}

/** Mobile staff Pay: payout status, request list with stats, per-request detail and actions, new request sheet. Refunds and CSV export live on the web. */
export function StaffScreen({
  owner,
  canSend,
  embedded = false,
}: {
  owner: Owner;
  canSend: boolean;
  /** Inside Team details: no "Pay / Collection" title and no My payments toggle, only the team collection. */
  embedded?: boolean;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'team' | 'mine'>('team');
  const [ready, setReady] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const payout = usePayout(owner, setReady);
  const events = useLoad(
    () => listPaymentEvents(supabase, owner),
    [owner.teamId, owner.clubId, refresh],
  );
  const list = (events.data ?? []).filter((e) => e.status !== 'draft');
  const ids = list.map((e) => e.id).join(',');
  const sums = useLoad(async () => {
    const out: Summaries = {};
    await Promise.all(
      list.map(async (e) => {
        out[e.id] = (await getCollectionSummary(supabase, e.id)).data;
      }),
    );
    return { data: out, error: null };
  }, [ids, refresh]);
  const current = list.find((e) => e.id === selected) ?? null;
  const notSetUp = payout.key === 'not_started' && !payout.st.loading;
  const policy = (payout.st.data?.default_fee_policy as FeePolicy | undefined) ?? 'absorb';
  const changed = () => setRefresh((n) => n + 1);

  return (
    <View style={{ gap: space[4] }}>
      {current && mode === 'team' ? null : embedded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {payout.key === 'ready' ? <PayoutBadge fill onPress={() => setSettings(true)} /> : null}
          {canSend ? (
            <Button
              title="New"
              icon="plus"
              disabled={!ready}
              onPress={() => setDrawer(true)}
              testID="new-request"
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1 }}>
              <H1>Pay</H1>
              <Text variant="caption" muted>
                Collection
              </Text>
            </View>
            {mode === 'team' && canSend ? (
              <Button
                title="New"
                icon="plus"
                disabled={!ready}
                onPress={() => setDrawer(true)}
                testID="new-request"
              />
            ) : null}
          </View>
          <SegmentedControl
            label="Pay view"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'mine', label: 'My payments' },
              { value: 'team', label: 'Team collection' },
            ]}
          />
        </>
      )}
      {mode === 'mine' ? (
        <PayScreen embedded />
      ) : (
        <>
          {payout.key === 'ready' && !current && !embedded ? (
            <PayoutBadge onPress={() => setSettings(true)} />
          ) : null}
          {notSetUp ? <PayoutSetupTile payout={payout} /> : null}
          {!notSetUp && payout.key !== 'ready' && !payout.st.loading ? (
            <PayoutNotice payout={payout} />
          ) : null}
          {current ? (
            <Detail
              event={current}
              canSend={canSend}
              onBack={() => setSelected(null)}
              showBack={!embedded}
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
                <Card style={{ alignItems: 'center', gap: space[3] }} testID="collection">
                  <Icon name="receipt" size="lg" />
                  <H2>No payment requests yet</H2>
                  <Text muted style={{ textAlign: 'center' }}>
                    Create one to collect fees, dues or tournament costs from your roster.
                  </Text>
                </Card>
              ) : (
                <List events={list} sums={sums.data ?? {}} onOpen={setSelected} />
              )}
            </LoadState>
          )}
        </>
      )}

      <Sheet open={drawer} onClose={() => setDrawer(false)} title="New payment request">
        <NewRequest
          owner={owner}
          canSend={ready}
          defaultPolicy={policy}
          onSent={changed}
          onClose={() => setDrawer(false)}
        />
      </Sheet>
      <Sheet open={settings} onClose={() => setSettings(false)} title="Payout settings">
        <View style={{ gap: space[3] }}>
          <H2>Payout settings</H2>
          <Text muted>Payouts are on. Money from payments goes to your bank account.</Text>
          {payout.canManage ? (
            <>
              <Button
                title="Open payout settings"
                variant="secondary"
                loading={payout.busy}
                onPress={payout.go}
              />
              <SegmentedControl
                label="Who pays the card fee by default"
                value={policy}
                options={[
                  { value: 'absorb', label: 'We pay the fee' },
                  { value: 'pass_on', label: 'Families pay a service fee' },
                ]}
                onChange={async (v) => {
                  const r = await setDefaultFeePolicy(supabase, owner, v);
                  if (r.error) toast(friendlyError(r.error), 'danger');
                  else payout.st.reload();
                }}
              />
            </>
          ) : (
            <Text variant="caption" muted>
              Ask a team admin to change payout settings.
            </Text>
          )}
        </View>
      </Sheet>
    </View>
  );
}

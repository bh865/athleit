import { friendlyError, registrationPriceLabel } from '@athleit/core';
import {
  addRegistrationNote,
  decideRegistration,
  getCapacitySummary,
  getRegistrationDetail,
  getRegistrationEvent,
  getRegistrationPaymentStatus,
  getSensitiveAnswers,
  listRegistrationEvents,
  listRegistrations,
  placeRegisteredPlayer,
  promoteFromWaitlist,
  setRegistrationEventState,
  type Owner,
  type RegistrationDetail,
} from '@athleit/db/registration';
import { radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Choice, FormMessage, H1, H2, ListItem, LoadState } from '@/components/app/kit';
import { Button, Card, ListGroup, Sheet, Text, TextField, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { SharePanel } from './share-panel';
import { StatusBadge } from './my-registrations';

const EVENT_TONE = {
  open: 'success',
  draft: 'neutral',
  closed: 'warning',
  archived: 'neutral',
} as const;

/** Team/club section: registrations list. Authoring (events, forms, waivers) is web-only. */
export function StaffRegistrationsSection({ owner }: { owner: Owner }) {
  const router = useRouter();
  const events = useLoad(
    () => listRegistrationEvents(supabase, owner),
    [owner.teamId, owner.clubId],
  );
  return (
    <View style={{ gap: space[3] }}>
      <H2>Registrations</H2>
      <LoadState
        loading={events.loading}
        error={events.error}
        empty={events.data?.length === 0}
        emptyText="No registrations yet. Create one on the web: building events and forms is web-only."
        onRetry={events.reload}
      >
        <ListGroup>
          {(events.data ?? []).map((e) => (
            <ListItem
              key={e.id}
              title={e.title}
              subtitle={`${registrationPriceLabel(e.price_cents)} · ${e.capacity ? `${e.capacity} spots` : 'No limit'}`}
              right={
                <Badge tone={EVENT_TONE[e.status as keyof typeof EVENT_TONE] ?? 'neutral'}>
                  {e.status}
                </Badge>
              }
              onPress={() => router.push(`/manage/registration/${e.id}` as never)}
            />
          ))}
        </ListGroup>
      </LoadState>
    </View>
  );
}

const FILTERS = [
  { value: 'review', label: 'To review' },
  { value: 'all', label: 'Everyone' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'waitlisted', label: 'Waitlist' },
  { value: 'placed', label: 'Placed' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

export function ManageEventScreen({ eventId }: { eventId: string }) {
  const { theme } = useTheme();
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>('review');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);
  const event = useLoad(() => getRegistrationEvent(supabase, eventId), [eventId, tick]);
  const cap = useLoad(() => getCapacitySummary(supabase, eventId), [eventId, tick]);
  const status =
    filter === 'review' ? ['submitted', 'waitlisted'] : filter === 'all' ? undefined : [filter];
  const rows = useLoad(
    () =>
      listRegistrations(supabase, eventId, {
        ...(status ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        limit: 50,
      }),
    [eventId, tick, filter, search],
  );
  const e = event.data;
  const c = cap.data;
  const pct = c?.capacity ? Math.min(100, Math.round((c.taken / c.capacity) * 100)) : 0;
  const refresh = () => setTick((n) => n + 1);

  async function setState(a: 'publish' | 'close') {
    setBusy(true);
    const r = await setRegistrationEventState(supabase, eventId, a);
    setBusy(false);
    setNotice(
      r.error
        ? { error: friendlyError(r.error) }
        : { success: a === 'publish' ? 'Published' : 'Closed' },
    );
    refresh();
  }
  async function promote() {
    setBusy(true);
    const r = await promoteFromWaitlist(supabase, eventId);
    setBusy(false);
    setNotice(
      r.error ? { error: friendlyError(r.error) } : { success: 'Moved the next family up' },
    );
    refresh();
  }
  return (
    <LoadState loading={event.loading} error={event.error} onRetry={event.reload}>
      {e ? (
        <View style={{ gap: space[4] }}>
          <H1>{e.title}</H1>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <Badge tone={EVENT_TONE[e.status as keyof typeof EVENT_TONE] ?? 'neutral'}>
              {e.status}
            </Badge>
            <Text muted>{registrationPriceLabel(e.price_cents)}</Text>
          </View>
          {e.status === 'draft' ? (
            <Button title="Publish" loading={busy} onPress={() => void setState('publish')} />
          ) : null}
          {e.status === 'open' ? (
            <Button
              title="Close registration"
              variant="secondary"
              loading={busy}
              onPress={() => void setState('close')}
            />
          ) : null}
          {c ? (
            <Card style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <H2>Capacity</H2>
                <Text variant="mono">
                  {c.capacity ? `${c.taken} / ${c.capacity}` : `${c.taken} registered`}
                </Text>
              </View>
              {c.capacity ? (
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Spots taken"
                  accessibilityValue={{ min: 0, max: c.capacity, now: c.taken }}
                  style={{
                    height: space[2],
                    borderRadius: radius.pill,
                    backgroundColor: theme.color.surfaceAlt,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      backgroundColor: theme.color.accent,
                    }}
                  />
                </View>
              ) : null}
              <Text muted>
                {c.submitted} to review · {c.accepted} accepted · {c.placed} placed · {c.waitlisted}{' '}
                waitlisted · {c.pending_verification} unconfirmed
              </Text>
              {c.waitlisted > 0 && c.spots_left > 0 ? (
                <Button
                  title="Move next family up"
                  variant="secondary"
                  loading={busy}
                  onPress={() => void promote()}
                />
              ) : null}
            </Card>
          ) : null}
          {e.status === 'open' || e.status === 'closed' ? (
            <Card style={{ gap: space[3] }}>
              <H2>Share</H2>
              <SharePanel slug={e.slug} title={e.title} />
            </Card>
          ) : null}
          <Choice label="Show" value={filter} options={FILTERS} onChange={setFilter} />
          <TextField
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, email or reference"
            autoCapitalize="none"
          />
          <LoadState
            loading={rows.loading}
            error={rows.error}
            empty={rows.data?.length === 0}
            emptyText="No registrations match."
            onRetry={rows.reload}
          >
            <ListGroup>
              {(rows.data ?? []).map((r) => (
                <ListItem
                  key={r.id}
                  title={`${r.player_first_name} ${r.player_last_name}`}
                  subtitle={`${r.guardian_name}${r.waivers_required ? ` · waivers ${r.waivers_signed}/${r.waivers_required}` : ''}${r.payment_status ? ` · ${r.payment_status}` : ''}`}
                  right={<StatusBadge status={r.status} />}
                  onPress={() => setOpen(r.id)}
                />
              ))}
            </ListGroup>
          </LoadState>
          <FormMessage
            {...(notice.error ? { error: notice.error } : { success: notice.success ?? null })}
          />
          <Text variant="caption" muted>
            Bulk actions, CSV export and the event builder are on the web.
          </Text>
        </View>
      ) : null}
      <RegistrationSheet
        key={open ?? 'none'}
        registrationId={open}
        onClose={() => setOpen(null)}
        onChanged={refresh}
        teamId={e?.target_team_id ?? e?.team_id ?? null}
      />
    </LoadState>
  );
}

const fmt = (v: unknown) =>
  v === null || v === undefined || v === ''
    ? '—'
    : Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'object'
        ? Object.values(v as Record<string, string>)
            .filter(Boolean)
            .join(', ')
        : typeof v === 'boolean'
          ? v
            ? 'Yes'
            : 'No'
          : String(v);

function RegistrationSheet({
  registrationId,
  onClose,
  onChanged,
  teamId,
}: {
  registrationId: string | null;
  onClose: () => void;
  onChanged: () => void;
  teamId: string | null;
}) {
  const { theme } = useTheme();
  const [tick, setTick] = useState(0);
  const detail = useLoad(
    () =>
      registrationId
        ? getRegistrationDetail(supabase, registrationId)
        : Promise.resolve({ data: null, error: { message: 'none' } } as never),
    [registrationId, tick],
  );
  const payment = useLoad(
    () =>
      registrationId
        ? getRegistrationPaymentStatus(supabase, registrationId)
        : Promise.resolve({ data: null, error: null } as never),
    [registrationId, tick],
  );
  const [sensitive, setSensitive] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [jersey, setJersey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = detail.data as RegistrationDetail | null;
  const pay = payment.data;
  const reg = d?.registration;
  const schema =
    (d?.form_schema as { fields?: { id: string; label: string; sensitive?: boolean }[] } | null)
      ?.fields ?? [];

  async function act(fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setDone(ok);
    onChanged();
    setTick((n) => n + 1);
  }
  async function showMedical() {
    if (!registrationId) return;
    setBusy(true);
    const r = await getSensitiveAnswers(supabase, registrationId);
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setSensitive((r.data ?? {}) as Record<string, unknown>);
  }
  return (
    <Sheet
      open={registrationId !== null}
      onClose={onClose}
      title={reg ? `${reg.player_first_name} ${reg.player_last_name}` : 'Registration'}
    >
      {!d || !reg ? (
        <Text muted>Loading…</Text>
      ) : (
        <View style={{ gap: space[3] }}>
          <H2>
            {reg.player_first_name} {reg.player_last_name}
          </H2>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <StatusBadge status={reg.status} />
            <Text variant="mono">{reg.display_id}</Text>
          </View>
          <Text muted>
            {reg.guardian_name} ({reg.guardian_relationship}) · {reg.guardian_email}
            {reg.guardian_phone ? ` · ${reg.guardian_phone}` : ''}
          </Text>
          <Text muted>
            Born {reg.player_date_of_birth} · {registrationPriceLabel(d.event.price_cents)}
          </Text>
          {schema
            .filter((f) => !f.sensitive)
            .map((f) => (
              <View key={f.id}>
                <Text variant="caption" muted>
                  {f.label}
                </Text>
                <Text>{fmt(reg.answers[f.id])}</Text>
              </View>
            ))}
          {d.has_sensitive ? (
            <View
              style={{
                gap: space[2],
                padding: space[4],
                borderRadius: radius.md,
                backgroundColor: theme.color.warnSoft,
              }}
            >
              <H2>Medical information</H2>
              {sensitive ? (
                <>
                  {schema
                    .filter((f) => f.sensitive)
                    .map((f) => (
                      <View key={f.id}>
                        <Text variant="caption" muted>
                          {f.label}
                        </Text>
                        <Text>{fmt(sensitive[f.id])}</Text>
                      </View>
                    ))}
                  <Button title="Hide" variant="secondary" onPress={() => setSensitive(null)} />
                </>
              ) : d.can_read_sensitive ? (
                <>
                  <Text>
                    Opening this is recorded in the audit log with your name and the time.
                  </Text>
                  <Button
                    title="Show medical info"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => void showMedical()}
                  />
                </>
              ) : (
                <Text muted>Only people with medical-information access can view this.</Text>
              )}
            </View>
          ) : null}
          {d.waivers.length > 0 ? (
            <View style={{ gap: space[1] }}>
              <H2>Waivers</H2>
              {d.waivers.map((w) => (
                <Text key={w.waiver_version_id}>
                  {w.title}: {w.acceptance_id ? 'signed' : 'not signed'}
                </Text>
              ))}
            </View>
          ) : null}
          {pay ? (
            <Text>
              Payment: {registrationPriceLabel(pay.amount_cents)} · {pay.request_status}
              {pay.refundable ? ' · refund on web' : ''}
            </Text>
          ) : null}
          {d.can_decide && ['submitted', 'waitlisted', 'accepted'].includes(reg.status) ? (
            <View style={{ gap: space[2] }}>
              <TextField
                label="Message to the family (optional)"
                value={message}
                onChangeText={setMessage}
                multiline
              />
              {reg.status !== 'accepted' ? (
                <Button
                  title="Accept"
                  disabled={busy}
                  onPress={() =>
                    void act(
                      () => decideRegistration(supabase, reg.id, 'accept', message),
                      'Accepted',
                    )
                  }
                />
              ) : null}
              {reg.status === 'submitted' ? (
                <Button
                  title="Waitlist"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    void act(
                      () => decideRegistration(supabase, reg.id, 'waitlist', message),
                      'Waitlisted',
                    )
                  }
                />
              ) : null}
              <Button
                title="Decline"
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  void act(
                    () => decideRegistration(supabase, reg.id, 'decline', message),
                    'Declined',
                  )
                }
              />
            </View>
          ) : null}
          {reg.status === 'accepted' && teamId ? (
            <View style={{ gap: space[2] }}>
              <H2>Place on the roster</H2>
              <Text muted>Accepted does not mean placed.</Text>
              <TextField
                label="Jersey number (optional)"
                value={jersey}
                onChangeText={(t) => setJersey(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
              />
              <Button
                title="Place on roster"
                disabled={busy}
                onPress={() =>
                  void act(
                    () =>
                      placeRegisteredPlayer(supabase, {
                        registrationId: reg.id,
                        teamId,
                        ...(jersey ? { jerseyNumber: Number(jersey) } : {}),
                      }),
                    'Placed on the roster',
                  )
                }
              />
            </View>
          ) : null}
          <H2>Notes</H2>
          {d.notes.map((n) => (
            <Text key={n.id}>
              {n.body} <Text muted>({n.author_name})</Text>
            </Text>
          ))}
          <TextField
            label="Add a private note"
            value={note}
            onChangeText={setNote}
            multiline
            hint="Staff only. Don’t record medical details here."
          />
          <Button
            title="Add note"
            variant="secondary"
            disabled={busy || !note.trim()}
            onPress={() =>
              void act(async () => {
                const r = await addRegistrationNote(supabase, reg.id, note);
                if (!r.error) setNote('');
                return r;
              }, 'Note added')
            }
          />
          <FormMessage {...(error ? { error } : { success: done })} />
        </View>
      )}
    </Sheet>
  );
}

'use client';

import { buildRegistrationCsv, friendlyError, registrationPriceLabel } from '@athleit/core';
import {
  decideRegistration,
  exportRegistrationRows,
  getCapacitySummary,
  getRegistrationEvent,
  listRegistrations,
  promoteFromWaitlist,
  setRegistrationEventState,
} from '@athleit/db/registration';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import { Badge, Button, Card, Heading, Icon, Select, Text, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { RegistrationSheet } from './registration-sheet';
import styles from './registration.module.css';
import { SharePanel } from './share-panel';
import { RegistrationStatusBadge } from './status';

const FILTERS = [
  { value: '', label: 'Needs a decision' },
  { value: 'all', label: 'Everyone' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'placed', label: 'Placed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
];
const PAGE = 50;

export function ManageEvent({ eventId }: { eventId: string }) {
  const client = getClient();
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  const event = useLoad(() => getRegistrationEvent(client, eventId), [eventId, tick]);
  const capacity = useLoad(() => getCapacitySummary(client, eventId), [eventId, tick]);
  const status =
    filter === '' ? ['submitted', 'waitlisted'] : filter === 'all' ? undefined : [filter];
  const rows = useLoad(
    () =>
      listRegistrations(client, eventId, {
        ...(status ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        unpaid,
        missingWaivers: missing,
        limit: PAGE,
        offset: page * PAGE,
      }),
    [eventId, tick, filter, search, unpaid, missing, page],
  );
  const e = event.data;
  const teams = useLoad(async () => {
    if (!e) return { data: [] as { id: string; name: string }[], error: null };
    if (e.target_team_id ?? e.team_id) {
      const id = (e.target_team_id ?? e.team_id) as string;
      const { data, error } = await client.from('teams').select('id, name').eq('id', id);
      return error
        ? { data: null, error: { message: error.message } }
        : { data: data ?? [], error: null };
    }
    const { data, error } = await client
      .from('teams')
      .select('id, name')
      .eq('club_id', e.club_id as string)
      .order('name');
    return error
      ? { data: null, error: { message: error.message } }
      : { data: data ?? [], error: null };
  }, [e?.id, e?.target_team_id]);

  const total = rows.data?.[0]?.total_count ?? 0;
  const cap = capacity.data;
  const pct = cap && cap.capacity ? Math.min(100, Math.round((cap.taken / cap.capacity) * 100)) : 0;
  const ids = useMemo(() => (rows.data ?? []).map((r) => r.id), [rows.data]);
  const refresh = () => setTick((n) => n + 1);
  const paymentsHref = e?.team_id
    ? `/teams/${e.team_id}/payments`
    : `/clubs/${e?.club_id}/payments`;

  async function setState(a: 'publish' | 'close' | 'archive') {
    setBusy(true);
    const r = await setRegistrationEventState(client, eventId, a);
    setBusy(false);
    setNotice(
      r.error
        ? { error: friendlyError(r.error) }
        : { success: a === 'publish' ? 'Published' : a === 'close' ? 'Closed' : 'Archived' },
    );
    refresh();
  }
  async function bulk(decision: 'accept' | 'waitlist' | 'decline') {
    setBusy(true);
    let okCount = 0;
    const failures: string[] = [];
    // One at a time: each decision takes the event lock, and one failure (event full) must not hide the others.
    for (const id of selected) {
      const r = await decideRegistration(client, id, decision);
      if (r.error) failures.push(friendlyError(r.error));
      else okCount++;
    }
    setBusy(false);
    setSelected(new Set());
    setNotice({
      ...(okCount ? { success: `${okCount} updated` } : {}),
      ...(failures.length
        ? { error: `${failures.length} could not be updated: ${[...new Set(failures)][0]}` }
        : {}),
    });
    refresh();
  }
  async function promote() {
    setBusy(true);
    const r = await promoteFromWaitlist(client, eventId);
    setBusy(false);
    setNotice(
      r.error
        ? { error: friendlyError(r.error) }
        : { success: 'Moved the next family up from the waitlist' },
    );
    refresh();
  }
  async function exportCsv(includeSensitive: boolean) {
    setBusy(true);
    const r = await exportRegistrationRows(client, eventId, includeSensitive);
    setBusy(false);
    if (r.error) return setNotice({ error: friendlyError(r.error) });
    const data = r.data as {
      fields: { id: string; label: string }[];
      rows: Record<string, unknown>[];
    };
    const csv = buildRegistrationCsv(data.fields, data.rows, includeSensitive);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${e?.slug ?? 'registrations'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={styles.stack}>
      <LoadState loading={event.loading} error={event.error} onRetry={event.reload}>
        {e ? (
          <>
            <div className={`${styles.row} ${styles.between}`}>
              <div className={styles.stack}>
                <Heading as="h1" level="title">
                  {e.title}
                </Heading>
                <div className={styles.row}>
                  <Badge
                    tone={
                      e.status === 'open'
                        ? 'success'
                        : e.status === 'closed'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {e.status}
                  </Badge>
                  <Text muted>{registrationPriceLabel(e.price_cents)}</Text>
                </div>
              </div>
              <div className={styles.row}>
                {e.status === 'draft' && (
                  <Button disabled={busy} onClick={() => void setState('publish')}>
                    Publish
                  </Button>
                )}
                {e.status === 'open' && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void setState('close')}
                  >
                    Close registration
                  </Button>
                )}
                {e.status !== 'archived' && e.status !== 'draft' && (
                  <Button variant="ghost" disabled={busy} onClick={() => void setState('archive')}>
                    Archive
                  </Button>
                )}
                {e.status === 'draft' || e.status === 'open' ? (
                  <Link href={`/manage/registration/${e.id}/edit`}>
                    <Button variant="secondary">Edit</Button>
                  </Link>
                ) : null}
              </div>
            </div>

            {cap && (
              <Card>
                <div className={styles.stack}>
                  <div className={`${styles.row} ${styles.between}`}>
                    <Heading as="h2">Capacity</Heading>
                    <Text variant="mono">
                      {cap.capacity ? `${cap.taken} / ${cap.capacity}` : `${cap.taken} registered`}
                    </Text>
                  </div>
                  {cap.capacity ? (
                    <div
                      className={styles.meter}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={cap.capacity}
                      aria-valuenow={cap.taken}
                      aria-label="Spots taken"
                    >
                      <div
                        className={styles.meterFill}
                        style={{ ['--pct' as string]: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                  <div className={styles.row}>
                    <Text muted>{cap.submitted} to review</Text>
                    <Text muted>{cap.accepted} accepted</Text>
                    <Text muted>{cap.placed} placed</Text>
                    <Text muted>{cap.waitlisted} waitlisted</Text>
                    <Text muted>{cap.pending_verification} unconfirmed</Text>
                  </div>
                  {cap.waitlisted > 0 && cap.spots_left > 0 && (
                    <Button variant="secondary" disabled={busy} onClick={() => void promote()}>
                      Move next family up from the waitlist
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {e.status === 'open' || e.status === 'closed' ? (
              <Card>
                <div className={styles.stack}>
                  <Heading as="h2">Share</Heading>
                  <SharePanel path={`/r/${e.slug}`} title={e.title} />
                </div>
              </Card>
            ) : null}

            <Card>
              <div className={styles.stack}>
                <div className={styles.row}>
                  <Select
                    label="Show"
                    value={filter}
                    onChange={(ev) => {
                      setFilter(ev.target.value);
                      setPage(0);
                    }}
                    options={FILTERS}
                  />
                  <TextField
                    label="Search"
                    value={search}
                    onChange={(ev) => {
                      setSearch(ev.target.value);
                      setPage(0);
                    }}
                    placeholder="Name, email or reference"
                  />
                  <label className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={unpaid}
                      onChange={(ev) => {
                        setUnpaid(ev.target.checked);
                        setPage(0);
                      }}
                    />{' '}
                    Unpaid
                  </label>
                  <label className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={missing}
                      onChange={(ev) => {
                        setMissing(ev.target.checked);
                        setPage(0);
                      }}
                    />{' '}
                    Missing waivers
                  </label>
                </div>
                {selected.size > 0 && (
                  <div className={styles.row} role="group" aria-label="Bulk actions">
                    <Text>{selected.size} selected</Text>
                    <Button disabled={busy} onClick={() => void bulk('accept')}>
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void bulk('waitlist')}
                    >
                      Waitlist
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void bulk('decline')}
                    >
                      Decline
                    </Button>
                  </div>
                )}
                <LoadState
                  loading={rows.loading}
                  error={rows.error}
                  empty={rows.data?.length === 0}
                  emptyText="No registrations match."
                  onRetry={rows.reload}
                >
                  <div className={styles.scroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">
                            <input
                              type="checkbox"
                              aria-label="Select all on this page"
                              checked={ids.length > 0 && ids.every((i) => selected.has(i))}
                              onChange={(ev) =>
                                setSelected(ev.target.checked ? new Set(ids) : new Set())
                              }
                            />
                          </th>
                          <th scope="col">Child</th>
                          <th scope="col">Guardian</th>
                          <th scope="col">Status</th>
                          <th scope="col">Payment</th>
                          <th scope="col">Waivers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rows.data ?? []).map((r) => (
                          <tr key={r.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select ${r.player_first_name} ${r.player_last_name}`}
                                checked={selected.has(r.id)}
                                onChange={() => toggle(r.id)}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => setOpen(r.id)}
                              >
                                {r.player_first_name} {r.player_last_name}
                              </button>
                            </td>
                            <td>{r.guardian_name}</td>
                            <td>
                              <RegistrationStatusBadge status={r.status} />
                              {r.waitlist_position ? ` #${r.waitlist_position}` : ''}
                            </td>
                            <td>{r.payment_status ?? '—'}</td>
                            <td>
                              {r.waivers_required
                                ? `${r.waivers_signed}/${r.waivers_required}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={`${styles.row} ${styles.between}`}>
                    <Text muted>{total} total</Text>
                    <div className={styles.row}>
                      <Button
                        variant="secondary"
                        disabled={page === 0}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={(page + 1) * PAGE >= total}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </LoadState>
              </div>
            </Card>

            <div className={styles.row}>
              <Button variant="secondary" disabled={busy} onClick={() => void exportCsv(false)}>
                <Icon name="download-simple" /> Export CSV
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void exportCsv(true)}>
                Export with medical info
              </Button>
            </div>
            <Text muted>
              Exports are recorded in the audit log. Medical info is included only if you hold
              access to it.
            </Text>
            {notice.error ? <FormMessage error={notice.error} /> : null}
            {notice.success ? <FormMessage success={notice.success} /> : null}
          </>
        ) : null}
      </LoadState>
      <RegistrationSheet
        key={open ?? 'none'}
        registrationId={open}
        onClose={() => setOpen(null)}
        onChanged={refresh}
        teams={teams.data ?? []}
        paymentsHref={paymentsHref}
      />
    </div>
  );
}

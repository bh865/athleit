'use client';

import { friendlyError, registrationPriceLabel } from '@athleit/core';
import {
  addRegistrationNote,
  decideRegistration,
  getRegistrationDetail,
  getRegistrationPaymentStatus,
  getSensitiveAnswers,
  placeRegisteredPlayer,
  type RegistrationDetail,
} from '@athleit/db/registration';
import Link from 'next/link';
import { useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { Button, Heading, Select, Sheet, Text, TextArea, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './registration.module.css';
import { RegistrationStatusBadge } from './status';

interface FormField {
  id: string;
  label: string;
  sensitive?: boolean;
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

/**
 * Staff detail for one registration. Medical (sensitive) answers are NEVER loaded with the detail: they appear only
 * after "Show medical info", which calls the audited database function, and are dropped from memory when the sheet closes.
 */
export function RegistrationSheet({
  registrationId,
  onClose,
  onChanged,
  teams,
  paymentsHref,
}: {
  registrationId: string | null;
  onClose: () => void;
  onChanged: () => void;
  teams: { id: string; name: string }[];
  paymentsHref: string;
}) {
  const client = getClient();
  const [sensitive, setSensitive] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [jersey, setJersey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The parent re-keys this component per registration, so state (including any medical answers) starts empty.
  const detail = useLoad(
    () =>
      registrationId
        ? getRegistrationDetail(client, registrationId)
        : Promise.resolve({ data: null, error: { message: 'none' } } as never),
    [registrationId],
  );
  const payment = useLoad(
    () =>
      registrationId
        ? getRegistrationPaymentStatus(client, registrationId)
        : Promise.resolve({ data: null, error: null } as never),
    [registrationId],
  );
  const d = detail.data as RegistrationDetail | null;
  const pay = payment.data;
  const load = async () => {
    detail.reload();
    payment.reload();
  };

  async function act(fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setDone(ok);
    onChanged();
    await load();
  }

  async function showMedical() {
    if (!registrationId) return;
    setBusy(true);
    const r = await getSensitiveAnswers(client, registrationId);
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setSensitive((r.data ?? {}) as Record<string, unknown>);
  }

  const schema = (d?.form_schema as { fields?: FormField[] } | null)?.fields ?? [];
  const reg = d?.registration;
  const title = reg ? `${reg.player_first_name} ${reg.player_last_name}` : 'Registration';

  return (
    <Sheet open={registrationId !== null} onClose={onClose} title={title}>
      <div className={styles.stack}>
        {!d || !reg ? (
          <Text muted>Loading…</Text>
        ) : (
          <>
            <div className={styles.row}>
              <RegistrationStatusBadge status={reg.status} />
              <Text variant="mono">{reg.display_id}</Text>
              {reg.waitlist_position ? <Text muted>Waitlist #{reg.waitlist_position}</Text> : null}
            </div>
            <dl className={styles.factGrid}>
              <div className={styles.fact}>
                <dt>Date of birth</dt>
                <dd>{reg.player_date_of_birth}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Guardian</dt>
                <dd>
                  {reg.guardian_name} ({reg.guardian_relationship})
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Email</dt>
                <dd>{reg.guardian_email}</dd>
              </div>
              {reg.guardian_phone ? (
                <div className={styles.fact}>
                  <dt>Phone</dt>
                  <dd>{reg.guardian_phone}</dd>
                </div>
              ) : null}
              <div className={styles.fact}>
                <dt>Price</dt>
                <dd>{registrationPriceLabel(d.event.price_cents)}</dd>
              </div>
            </dl>

            <Heading as="h2">Answers</Heading>
            <dl className={styles.factGrid}>
              {schema
                .filter((f) => !f.sensitive)
                .map((f) => (
                  <div key={f.id} className={styles.fact}>
                    <dt>{f.label}</dt>
                    <dd>{fmt(reg.answers[f.id])}</dd>
                  </div>
                ))}
            </dl>

            {d.has_sensitive && (
              <div className={styles.sensitive}>
                <Heading as="h2">Medical information</Heading>
                {sensitive ? (
                  <>
                    <dl className={styles.factGrid}>
                      {schema
                        .filter((f) => f.sensitive)
                        .map((f) => (
                          <div key={f.id} className={styles.fact}>
                            <dt>{f.label}</dt>
                            <dd>{fmt(sensitive[f.id])}</dd>
                          </div>
                        ))}
                    </dl>
                    <Button variant="secondary" onClick={() => setSensitive(null)}>
                      Hide
                    </Button>
                  </>
                ) : d.can_read_sensitive ? (
                  <>
                    <Text as="p">
                      Opening this is recorded in the audit log with your name and the time.
                    </Text>
                    <Button variant="secondary" onClick={() => void showMedical()} disabled={busy}>
                      Show medical info
                    </Button>
                  </>
                ) : (
                  <Text as="p" muted>
                    Only people with medical-information access can view this.
                  </Text>
                )}
              </div>
            )}

            <Heading as="h2">Waivers</Heading>
            {d.waivers.length === 0 ? (
              <Text muted>No waivers for this registration.</Text>
            ) : (
              <ul className={styles.list}>
                {d.waivers.map((w) => (
                  <li key={w.waiver_version_id} className={styles.item}>
                    <Text className={styles.grow}>{w.title}</Text>
                    <Text muted>
                      {w.acceptance_id
                        ? `Signed ${new Date(w.accepted_at ?? '').toLocaleDateString('en-US', { dateStyle: 'medium' })}`
                        : 'Not signed'}
                    </Text>
                  </li>
                ))}
              </ul>
            )}

            {pay && (
              <>
                <Heading as="h2">Payment</Heading>
                <Text as="p">
                  {registrationPriceLabel(pay.amount_cents)} · {pay.request_status}
                  {pay.refundable ? ' · refundable' : ''}
                </Text>
                {pay.refundable ? <Link href={paymentsHref}>Refund in Payments</Link> : null}
              </>
            )}

            {d.can_decide && ['submitted', 'waitlisted', 'accepted'].includes(reg.status) && (
              <div className={styles.stack}>
                <Heading as="h2">Decision</Heading>
                <TextArea
                  label="Message to the family (optional)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
                <div className={styles.row}>
                  {reg.status !== 'accepted' && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => decideRegistration(client, reg.id, 'accept', message),
                          'Accepted',
                        )
                      }
                    >
                      Accept
                    </Button>
                  )}
                  {reg.status === 'submitted' && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => decideRegistration(client, reg.id, 'waitlist', message),
                          'Waitlisted',
                        )
                      }
                    >
                      Waitlist
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => decideRegistration(client, reg.id, 'decline', message),
                        'Declined',
                      )
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            )}

            {reg.status === 'accepted' && teams.length > 0 && (
              <div className={styles.stack}>
                <Heading as="h2">Place on a team</Heading>
                <Text muted>
                  Accepted does not mean placed. Placing adds the child to the roster and links the
                  player.
                </Text>
                <Select
                  label="Team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                />
                <TextField
                  label="Jersey number (optional)"
                  inputMode="numeric"
                  value={jersey}
                  onChange={(e) => setJersey(e.target.value.replace(/\D/g, '').slice(0, 2))}
                />
                <Button
                  disabled={busy || !teamId}
                  onClick={() =>
                    void act(
                      () =>
                        placeRegisteredPlayer(client, {
                          registrationId: reg.id,
                          teamId,
                          ...(jersey ? { jerseyNumber: Number(jersey) } : {}),
                        }),
                      'Placed on the roster',
                    )
                  }
                >
                  Place on roster
                </Button>
              </div>
            )}

            <Heading as="h2">Notes</Heading>
            <ul className={styles.list}>
              {d.notes.map((n) => (
                <li key={n.id} className={styles.item}>
                  <Text className={styles.grow}>{n.body}</Text>
                  <Text muted>{n.author_name}</Text>
                </li>
              ))}
            </ul>
            <TextArea
              label="Add a private note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={4000}
              hint="Visible to staff only. Don’t record medical details here."
            />
            <Button
              variant="secondary"
              disabled={busy || !note.trim()}
              onClick={() =>
                void act(async () => {
                  const r = await addRegistrationNote(client, reg.id, note);
                  if (!r.error) setNote('');
                  return r;
                }, 'Note added')
              }
            >
              Add note
            </Button>
          </>
        )}
        {error ? <FormMessage error={error} /> : null}
        {done ? <FormMessage success={done} /> : null}
      </div>
    </Sheet>
  );
}

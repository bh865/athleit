'use client';

import {
  createHouseholdInvite,
  createInvite,
  deleteInvite,
  listInvites,
  revokeInvite,
  type InviteTarget,
} from '@athleit/db/api';
import { friendlyError } from '@athleit/core';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  ConfirmSheet,
  Icon,
  SegmentedControl,
  Select,
  TextField,
} from '@/components/ui';
import { BillingGateNote, useBillingGate } from '@/components/billing/use-billing-gate';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './app.module.css';
import { FamilyCodePanel } from './family-code-panel';
import { FormMessage, LoadState } from './states';

export interface RoleOption {
  value: string;
  label: string;
}

const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line no-restricted-syntax -- design-exception: raster resolution of the QR image (2x its display size), not a layout value
    QRCode.toDataURL(text, { margin: 1, width: 384 }).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [text]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code for the invite link" className={styles.qr} /> : null;
}

function status(inv: {
  revoked_at: string | null;
  expires_at: string;
  use_count: number;
  max_uses: number;
}) {
  if (inv.revoked_at) return { label: 'Revoked', tone: 'danger' as const };
  if (new Date(inv.expires_at) <= new Date()) return { label: 'Expired', tone: 'warning' as const };
  if (inv.use_count >= inv.max_uses) return { label: 'Used up', tone: 'neutral' as const };
  return { label: 'Active', tone: 'success' as const };
}

/** Create invite links (with QR + copy), list them, and revoke. Roles shown depend on the caller. */
export function InvitePanel({
  target,
  roles,
  childNames = [],
}: {
  target: InviteTarget;
  roles: readonly RoleOption[];
  /** Household invites only: the children named in the approve confirmation. */
  childNames?: readonly string[];
}) {
  if ('householdId' in target)
    return (
      <HouseholdInvite householdId={target.householdId} roles={roles} childNames={childNames}>
        <LinkInvitePanel target={target} roles={roles} />
      </HouseholdInvite>
    );
  return <LinkInvitePanel target={target} roles={roles} />;
}

/** Household invite card body: a Link | Code toggle. */
function HouseholdInvite({
  householdId,
  childNames,
  children,
}: {
  householdId: string;
  roles: readonly RoleOption[];
  childNames: readonly string[];
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<'link' | 'code'>('link');
  return (
    <div className={styles.stack}>
      <div>
        <SegmentedControl
          label="Invite method"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'link', label: 'Link' },
            { value: 'code', label: 'Code' },
          ]}
        />
      </div>
      {tab === 'link' ? (
        children
      ) : (
        <FamilyCodePanel householdId={householdId} childNames={childNames} />
      )}
    </div>
  );
}

function LinkInvitePanel({
  target,
  roles,
}: {
  target: InviteTarget;
  roles: readonly RoleOption[];
}) {
  const client = getClient();
  const gate = useBillingGate('teamId' in target ? target.teamId : undefined);
  const key = JSON.stringify(target);
  const list = useLoad(() => listInvites(client, target), [key]);
  const [role, setRole] = useState(roles[0]?.value ?? '');
  const [days, setDays] = useState('7');
  const [uses, setUses] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; role: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const expiresInDays = Number(days);
    const maxUses = Number(uses);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90)
      return setError('Choose an expiry between 1 and 90 days.');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
      return setError('Choose between 1 and 1000 uses.');
    setError(null);
    setBusy(true);
    const res =
      'householdId' in target
        ? await createHouseholdInvite(client, {
            householdId: target.householdId,
            expiresInDays,
            maxUses,
          })
        : await createInvite(client, { target, role, expiresInDays, maxUses });
    setBusy(false);
    const row = res.data?.[0];
    if (res.error || !row) return setError(friendlyError(res.error));
    setCreated({ url: inviteUrl(row.token), role });
    setCopied(false);
    list.reload();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Could not copy automatically. Select the link and copy it.');
    }
  }

  async function onRevoke(id: string) {
    const res = await revokeInvite(client, id);
    if (res.error) setError(friendlyError(res.error));
    else list.reload();
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await deleteInvite(client, deleting);
    setBusy(false);
    setDeleting(null);
    if (res.error) setError(friendlyError(res.error));
    else list.reload();
  }

  return (
    <div className={styles.stack}>
      <form onSubmit={onCreate} className={styles.stack} noValidate>
        {roles.length > 1 && (
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={roles}
          />
        )}
        <div className={styles.row}>
          <TextField
            label="Expires in (days)"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <TextField
            label="Number of uses"
            inputMode="numeric"
            value={uses}
            onChange={(e) => setUses(e.target.value)}
          />
        </div>
        <FormMessage error={error} />
        <BillingGateNote gate={gate} what="Creating invites" />
        <div>
          <Button type="submit" loading={busy} disabled={gate.restricted} icon-label="create">
            <Icon name="qr-code" /> Create invite link
          </Button>
        </div>
      </form>

      {created && (
        <div className={`${styles.notice} ${styles.stack}`} data-testid="new-invite">
          <p>
            <strong>Share this link.</strong> It’s shown once; anyone with it can join as{' '}
            {roles.find((r) => r.value === created.role)?.label.toLowerCase() ?? created.role}.
          </p>
          <p className={styles.mono} data-testid="invite-link">
            {created.url}
          </p>
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => void copy(created.url)}>
              <Icon name="copy" /> {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <Qr text={created.url} />
        </div>
      )}

      <h3 className={styles.section}>Invites</h3>
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        emptyText="No invites yet."
        onRetry={list.reload}
      >
        <ul className={styles.list}>
          {list.data?.map((inv) => {
            const s = status(inv);
            return (
              <li key={inv.id} className={styles.item}>
                <div className={styles.grow}>
                  <strong>{roles.find((r) => r.value === inv.role)?.label ?? inv.role}</strong>
                  <p className={styles.muted}>
                    {inv.use_count}/{inv.max_uses} used · expires{' '}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
                {s.label === 'Active' && (
                  <Button
                    variant="ghost"
                    onClick={() => void onRevoke(inv.id)}
                    aria-label={`Revoke ${inv.role} invite`}
                  >
                    Revoke
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setDeleting(inv.id)}
                  aria-label={`Delete ${inv.role} invite`}
                >
                  <Icon name="trash" size="sm" /> Delete
                </Button>
              </li>
            );
          })}
        </ul>
      </LoadState>
      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this invite?"
        confirmLabel="Delete invite"
        busy={busy}
        alert
        onConfirm={() => void onDelete()}
      >
        <p>
          It disappears from this list and its link stops working. People who already joined keep
          their access.
        </p>
      </ConfirmSheet>
    </div>
  );
}
